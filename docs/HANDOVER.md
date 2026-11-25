# 交接文件

本文件說明如何從零部署這個系統，以及日常維護。請依序操作，所有指令都在 PowerShell 執行，並且**一律在 `lab-scheduler` 專案資料夾內**執行（在上層資料夾執行 Supabase CLI 會靜默地什麼都沒推送）。第一次使用前，先在專案資料夾執行 `npm install`（第 6 節的腳本與第 7 節的 `npm run build` 都需要它）。

目前的正式環境：

- Supabase 專案 ref：`muehypeofgmbqhsvuccd`（Singapore）
- 前端：Cloudflare Worker `lab-scheduler`，網址 <https://lab-scheduler.npustabilab.workers.dev>
- GitHub：`npustabilab-star/lab-scheduler`（private）

系統以「學號 + 密碼」登入，沒有 Google 登入，也沒有自行註冊。所有成員都由管理者在「管理」頁建立：初始密碼為學號後四碼，第一次登入必須先改密碼。

## 1. 建立研究室共用帳號

1. 建立一個研究室共用的 Gmail 帳號（不要用個人帳號，方便日後交接），目前為 `npustabilab@gmail.com`。
2. 用這個帳號註冊 Supabase、Cloudflare、GitHub。
   - Supabase Dashboard 沒有「Continue with Google」：請用 **Email + 密碼（Sign up）** 以共用 Gmail 註冊，並把密碼交給接手的人保管。
3. 為共用 Gmail 開啟「兩步驟驗證」。
4. 到 Google 帳號的「安全性」→「應用程式密碼」產生 Gmail 應用程式密碼（16 碼），寄信時會用到。

## 2. Supabase Dashboard 導覽

1. 開啟 <https://supabase.com/dashboard>，用共用 Gmail 與密碼登入。
2. 選擇專案後，左側選單常用的位置：
   - **SQL Editor**：執行 SQL（設定 vault、清理測試資料都在這裡）。
   - **Table Editor**：直接檢視與修改資料表內容。
   - **Authentication**：Users（帳號列表）、Sign In / Providers（見第 4 節）。
   - **Edge Functions** → `notify-email` / `admin-members` → Logs：查看寄信與建立成員的紀錄與錯誤。
   - **Database** → Publications：確認 Realtime（見第 3 節）。
   - **Project Settings** → API Keys：取得 anon key 與 service_role key（要用「Legacy」分頁的舊版 JWT 金鑰，見第 3、6、7 節）；Project URL 在 Project Settings → General 或 API 頁。

## 3. 建立 Supabase 專案並推送資料庫

1. 在 Supabase Dashboard 建立新專案（目前專案已建立，ref 為 `muehypeofgmbqhsvuccd`），記下 Project ref 與資料庫密碼。
2. 在專案資料夾執行（第一次需要先登入 CLI，會開啟瀏覽器授權）：
   ```powershell
   cd <專案資料夾>\lab-scheduler   # 目前位於 C:\Users\user\Desktop\ABI-Agent\lab-scheduler
   npx supabase login
   npx supabase link --project-ref muehypeofgmbqhsvuccd
   npx supabase db push --remote
   ```
   - **一定要加 `--remote`**：這個版本的 CLI 在沒有 `--remote` 時會把 migration 推到本機（Docker）資料庫，而不是雲端。
   - 檢查雲端已套用哪些 migration：`npx supabase migration list --remote`，每個 migration 的「Remote」欄都要有值，而且最新的那個 migration（`20261125000016`，只有老師能管理管理者）也已套用。要確認雲端已是最新，看 `migration list --remote` 最後一列是不是 `20261125000016` 且 Remote 欄有值；中間的 `20261125000011`（API 權限 GRANT）、`000012`–`000015`（單日調整、七節＋午休、每週時段可指定日期）也都要有值。
   - **規則**：新增資料表或函式時，必須在 migration 裡明確 GRANT（雲端預設不給任何權限）。本機已與雲端一致（default privileges 已撤銷），漏寫 GRANT 時 `npx supabase test db` 會失敗。
3. Realtime：migration `20261124000008_realtime.sql` 會把前端訂閱的資料表（weekly_slots、slot_exceptions、bookings、no_class_days、notifications、profiles、semesters、periods）加入 `supabase_realtime` publication，不需要另外手動設定。推送後請到 Dashboard → Database → Publications，確認 `supabase_realtime` 列出這 8 張表；若沒有，畫面不會即時更新（需要重新整理才看得到變動）。
4. 在 Dashboard 的 SQL Editor 設定 vault 密碼（寄信的資料庫 trigger 會用到）：
   ```sql
   select vault.create_secret('https://muehypeofgmbqhsvuccd.supabase.co', 'edge_base_url');
   select vault.create_secret('<service_role key>', 'service_role_key');
   ```
   - `edge_base_url` 是專案網址，結尾不要加斜線。
   - `service_role_key` 必須是「舊版 JWT 格式」的 service_role key（以 `eyJ` 開頭）：Project Settings → API Keys → **Legacy** 分頁。**不要**使用新式的 `sb_secret_…` 金鑰，否則 Edge Function 會拒絕驗證，寄信會失敗。請勿外流此金鑰。

## 4. 設定 Supabase Authentication

到 Dashboard → Authentication，確認以下設定（這個系統只靠管理者建立帳號）：

1. **關閉「Allow new users to sign up」**（Sign In / Providers 頁的設定）。成員由 `admin-members` 函式以管理者權限建立，不需要開放註冊。
2. **Email provider 保持開啟**（學號登入在底層用 Email + 密碼認證，登入帳號是 `學號@users.lab-scheduler.internal` 這種內部位址，並不會真的寄信到該位址）。
3. **關閉「Confirm email」**。
4. 不需要設定任何其他登入方式（沒有第三方登入，也不需要額外的 Redirect URLs）。

## 5. 部署 Edge Functions

共有兩個函式：`notify-email`（寄通知信）與 `admin-members`（管理者新增成員、重設密碼）。

```powershell
npx supabase secrets set --project-ref muehypeofgmbqhsvuccd GMAIL_USER=<共用帳號的 Gmail> GMAIL_APP_PASSWORD=<應用程式密碼> APP_URL=https://lab-scheduler.npustabilab.workers.dev
npx supabase functions deploy notify-email --project-ref muehypeofgmbqhsvuccd
npx supabase functions deploy admin-members --project-ref muehypeofgmbqhsvuccd
```

- **`notify-email` 的程式碼有改動時（例如信件內容、節次標籤），一定要重新部署**（資料庫 migration 不會更新 Edge Function）：`npx supabase functions deploy notify-email --project-ref muehypeofgmbqhsvuccd`。
- `GMAIL_USER`、`GMAIL_APP_PASSWORD`、`APP_URL` 是 `notify-email` 讀取的環境變數；`admin-members` 只使用 Supabase 自動提供的 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`，不需要額外設定。

### 升級既有雲端專案

如果這個雲端專案在改成學號登入之前就已經有人用 Google 登入過，先清掉舊流程留下的帳號，再建立第一位管理者：

1. 到 Dashboard → SQL Editor 執行：
   ```sql
   select id, email, status, role, is_admin from profiles where student_id is null;
   ```
2. 如果有任何列，這些都是舊的 Google 流程留下的帳號：到 Authentication → Users 把它們刪除（專題生要先刪，研究生之後再刪）。
3. 確認 Authentication → Providers → **Google 已關閉**。
4. 也可以再檢查有沒有看不到的待核准殘留：
   ```sql
   select id, email from profiles where status = 'pending';
   ```
   有列出來的也一併在 Authentication → Users 刪除。

清理完成後再執行下面的 `create-first-admin`。

## 6. 建立第一位管理者（老師）

沒有任何成員時無法登入，需要先用腳本建立老師帳號。service_role key 一樣使用 Legacy 分頁的 `eyJ…` 金鑰。

```powershell
$env:SUPABASE_URL = "https://muehypeofgmbqhsvuccd.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key>"
node scripts/create-first-admin.mjs teacher 老師姓名 老師Email 初始密碼
```

- 參數依序是：登入用的學號（代碼，例如 `teacher`）、姓名、通知用 Email、密碼（至少 8 碼）。老師日後就用第一個參數當帳號登入。
- 老師自己決定密碼，所以第一次登入不會強迫改密碼。
- 這個腳本把密碼放在命令列上，會留在 PowerShell 歷史紀錄中。執行完請做其中一件事：
  - 執行 `Clear-History`，並刪除 `(Get-PSReadLineOption).HistorySavePath` 這個檔案中包含密碼的那幾行；或者
  - 老師第一次登入之後，立刻把密碼改掉，讓歷史紀錄中的密碼失效。
- 用完後清除環境變數：`Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY`。

## 7. 部署前端（Cloudflare Workers）

前端部署為名為 `lab-scheduler` 的 Cloudflare **Worker**（靜態資源，不是 Pages），不透過 Git 連結自動部署，需要手動執行。`wrangler.jsonc` 已設定 `not_found_handling: single-page-application`，所以子頁面重新整理不會 404，不需要 `_redirects`。

1. 用雲端的值建置。anon key 取自 Project Settings → API Keys → **Legacy** 分頁的 `anon` key：
   ```powershell
   $env:VITE_SUPABASE_URL = "https://muehypeofgmbqhsvuccd.supabase.co"
   $env:VITE_SUPABASE_ANON_KEY = "<anon key>"
   npm run build
   ```
   正式版建置缺少這兩個變數時會直接失敗（`vite.config.ts` 會丟出錯誤），這是預期行為。
2. 登入 Cloudflare（只需做一次，會開啟瀏覽器，請用共用 Gmail 登入）並部署：
   ```powershell
   npx wrangler login
   npx wrangler deploy
   ```
   第一次執行 `npx wrangler` 會先下載 wrangler，可能詢問是否繼續安裝，回答 `y`。
3. 部署完成後網址為 <https://lab-scheduler.npustabilab.workers.dev>。之後每次更新前端，只要重做步驟 1 與 `npx wrangler deploy`。
4. 注意：在同一個 PowerShell 視窗設過 `$env:VITE_SUPABASE_URL` 之後，再 `npm run dev` 會連到雲端資料庫。本機開發前請關掉該視窗，或執行 `Remove-Item Env:VITE_SUPABASE_URL, Env:VITE_SUPABASE_ANON_KEY`。

## 8. GitHub 程式碼備份

程式碼放在 `npustabilab-star/lab-scheduler`（private）。推送時若出現 `Repository not found`，通常是 Git 沿用了個人 GitHub 帳號的憑證，請清掉後重新推送，並在跳出的視窗以研究室帳號登入：

```powershell
git credential-manager github logout
git push
```

### 自動部署（GitHub Actions）

設定好之後，**只要推送到 `main`（`git push`），GitHub 會自動依序做：前端測試 → 推送資料庫更新 → 部署兩個後台函式 → 打包並部署網站**，不必再手動執行第 3、5、7 節的指令。設定檔是 `.github/workflows/deploy.yml`。

每次部署的結果在 GitHub repo 的 **Actions** 分頁查看（綠勾成功、紅叉失敗，點進去看是哪一步）；失敗時 GitHub 會寄信給推送的人。也可以在 Actions → Deploy → **Run workflow** 手動重跑。

**第一次要設定的值**（GitHub repo → Settings → Secrets and variables → Actions）：

Secrets（機密，設定後看不到內容）：

| 名稱 | 去哪裡拿 |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → 右上頭像 → Account preferences → **Access Tokens** → Generate new token |
| `SUPABASE_DB_PASSWORD` | 建立 Supabase 專案時設的資料庫密碼（忘了可在 Project Settings → Database → Reset database password 重設） |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → 右上頭像 → My Profile → **API Tokens** → Create Token → 範本 **Edit Cloudflare Workers** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers & Pages 首頁右側的 **Account ID** |

Variables（一般設定值，切到 Variables 分頁）：

| 名稱 | 值 |
|---|---|
| `SUPABASE_PROJECT_REF` | `muehypeofgmbqhsvuccd` |
| `VITE_SUPABASE_URL` | `https://muehypeofgmbqhsvuccd.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → Legacy 分頁的 **anon** key（公開用，不是 service_role） |

注意：
- 寄信用的 Gmail 密碼（`GMAIL_APP_PASSWORD` 等）存在 Supabase 的 secrets 裡，不用放到 GitHub；只有要更換時才需要手動執行第 5 節的 `secrets set`。
- 建立第一位管理者（第 6 節）仍是手動步驟，只需做一次。
- 推送到 `main` 就等於上線；有把握再推。

## 9. 部署後驗證（smoke test）

建議在建立「正式學期」**之前**執行；若正式學期已存在，測試學期的日期不可與它重疊（學期日期區間不可重疊，資料庫會拒絕）。測試期間請讓測試用的日期範圍遠離正式學期，例如正式學期是 2026-09-01 ~ 2027-01-31，測試學期可用 2027-03-01 ~ 2027-03-31。

1. **建立測試學期**：以老師（管理者）登入，「管理」→「學期」新增測試學期（名稱例如 `TEST`，日期範圍選在未來一個月內且不與正式學期重疊），設為目前學期。
2. **建立兩個測試帳號**：「管理」→「成員」→「新增成員」：
   - 測試研究生：學號例如 `test0001`、身分「研究生」。
   - 測試專題生：學號例如 `test0002`、身分「專題生」，指導研究生選剛剛的測試研究生。
   - Email 為選填；要驗證測試帳號收信的話，填一個你收得到信的信箱。
3. **首次登入改密碼**：分別用兩個測試帳號登入（帳號＝學號，初始密碼＝學號後四碼，例如 `0001`、`0002`），系統會要求設定新密碼，完成後才能進入網站。
4. **設定時段**（兩者必須是同一個星期與同一節；時段格子是「週視圖」，只能設定今天以後、學期內、非停課的日子）：
   - 老師到「我的值班」頁（老師看到的標題是「我的可約時段」），點一格，例如測試學期內某週的週三第 3 節，在跳出的視窗按「每週這節都可以」。
   - 測試研究生到「我的值班」頁，點相同的格子（週三第 3 節），同樣按「每週這節都可以」。
   - 可順便試「只有這週不行」／「恢復成每週固定」：格子會顯示「本週調整」。午休（午休 13:00–13:20，節次 8）也是可預約的時段，排在第 4 節與第 5 節之間。
5. **預約**：用測試專題生登入，到「預約」頁選一個「至少 7 天後」且落在測試學期內的週三第 3 節日期，送出預約。
6. **確認通知**：老師要收到「待你確認」的 Email（若沒收到，到 Edge Functions → `notify-email` → Logs 查錯），且網站的站內通知鈴鐺有對應通知。
7. **清理**（到 SQL Editor 執行；學號請替換成你實際使用的測試學號）：
   ```sql
   -- 刪除測試預約（通知會一併連動刪除）
   delete from bookings
     where undergrad_id in (select id from profiles where student_id in ('test0001', 'test0002'))
        or grad_id in (select id from profiles where student_id = 'test0001');
   -- 刪除測試帳號的時段與例外
   delete from weekly_slots
     where user_id in (select id from profiles where student_id in ('test0001', 'test0002'));
   delete from slot_exceptions
     where user_id in (select id from profiles where student_id in ('test0001', 'test0002'));
   -- 刪除老師在測試學期設定的時段（weekly_slots 隨學期連動刪除）
   delete from semesters where name = 'TEST';
   ```
   - 刪除測試學期時，老師在該學期的 `weekly_slots` 會一併刪除。如果測試學期曾被設為目前學期，請先到管理頁把正式學期設為目前學期，或之後再設定。
   - 測試帳號：到「管理」→「成員」按「停用」；或到 Authentication → Users 刪除該使用者（會連動刪除 profile，因此要先完成上面的預約清理）。在 Authentication → Users 刪除時，**要先刪測試專題生，再刪測試研究生**（專題生的指導研究生是這位研究生）。

## 10. 日常操作：成員管理

以下都在「管理」→「成員」頁，需要管理者身分：

- **新增成員**：填學號、姓名、身分（研究生／專題生／老師）；專題生要選指導研究生；Email 是通知信用，老師必填、其他人選填。初始密碼為學號後四碼，第一次登入需更改密碼。學號不分大小寫（統一轉小寫）、不可重複，且至少 4 碼。系統只允許一位啟用中的老師。
- **重設密碼**：沒有「忘記密碼」信件功能。成員忘記密碼時，由管理者在該成員列按「重設密碼」，密碼會被重設為學號後四碼，該成員下次登入需重新改密碼。**忘記密碼 = 管理者重設**。
- **修改 Email**：在該成員列的「通知 Email」欄位修改，按「儲存 Email」。
- **停用／啟用**：成員離開時按「停用」，不要刪除資料。
- **管理者**：只有老師可以設定或取消管理者，也只有老師能停用老師或其他管理者；其他管理者仍可停用一般成員。

## 11. 每學期開學

1. 在「管理」→「學期」新增學期，並設為目前學期。學期的日期區間不可和其他學期重疊（資料庫以 `semesters_no_overlap` 限制，重疊時畫面會提示「學期日期與現有學期重疊」）。
2. 提醒所有人到「我的值班」重新填寫每週格子（新學期不會沿用舊的格子）。
   - 「行事曆」頁是唯讀的週課表，只用來查看每週誰在、哪些時段已被預約；要改時段請到「我的值班」。
   - 一天共有 7 節課加上午休（節次 8，13:00–13:20，可預約），所有時間都用 24 小時制；午休的顯示名稱存在 `periods.label`。
3. 到「停課日」補上該學期的停課日，必要時在「節次時間」調整節次。

### 修改或刪除學期日期

管理頁目前只能新增學期，不能修改日期或刪除。需要時到 SQL Editor 執行：

```sql
-- 修改日期（新區間仍不可與其他學期重疊）
update semesters set start_date = '2026-09-07', end_date = '2027-01-22' where name = '115-1';

-- 刪除學期（該學期的每週時段會一併刪除；已有預約的學期不建議刪除）
delete from semesters where name = '115-1';
```

## 12. 常見維護

- 寒暑假後若 Supabase 專案被暫停，到 Dashboard 按 Restore 恢復，等待幾分鐘即可。
- 更換 Gmail 應用程式密碼：在 Google 帳號產生新的應用程式密碼，執行下列指令，不需要重新部署：
  ```powershell
  npx supabase secrets set --project-ref muehypeofgmbqhsvuccd GMAIL_APP_PASSWORD=<新密碼>
  ```
- 成員離開：在「管理」→「成員」按「停用」，不要刪除資料。

## 13. 本機開發備註

- 本機 Supabase 的連接埠已移到 API 55321、DB 55322，因為這台 Windows 機器保留了 54241-54340 這段連接埠，預設的 543xx 會衝突。
- 前端測試：`npm test -- --run`；資料庫測試：`npx supabase test db`。
- pgTAP（`npx supabase test db`）預期的是乾淨的資料庫：如果你在本機建立過使用者（例如跑過 `create-first-admin.mjs`），請先執行 `npx supabase db reset` 再跑測試。
- 本機 `npm run build` 需要 `.env`（`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`，值可由 `npx supabase status` 取得），或在 PowerShell 設定同名環境變數。
- Docker Desktop：如果 CLI 說無法連到 Docker engine，但 Docker Desktop 畫面顯示「Engine running」且 CPU 為 0，請先完全結束（Quit）Docker Desktop，執行 `wsl --shutdown`，再重新開啟 Docker Desktop。
