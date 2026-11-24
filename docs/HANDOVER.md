# 交接文件

本文件說明如何從零部署這個系統，以及日常維護。請依序操作。

## 1. 建立研究室共用 Google 帳號

1. 建立一個研究室共用的 Google 帳號（不要用個人帳號，方便日後交接）。
2. 用這個帳號註冊 Supabase、Cloudflare、Google Cloud（OAuth 用）。
3. 為這個 Google 帳號開啟「兩步驟驗證」。
4. 到 Google 帳號的「安全性」→「應用程式密碼」產生 Gmail 應用程式密碼（16 碼），寄信時會用到。

## 2. Supabase Dashboard 導覽

1. 開啟 <https://supabase.com/dashboard>，按「Continue with Google」，用研究室共用 Google 帳號登入。
2. 選擇專案後，左側選單常用的位置：
   - **SQL Editor**：執行 SQL（設定 vault、`bootstrap_admin`、清理測試資料都在這裡）。
   - **Table Editor**：直接檢視與修改資料表內容。
   - **Authentication**：Users（登入過的帳號）、Providers（Google）、URL Configuration（Site URL 與 Redirect URLs）。
   - **Edge Functions** → `notify-email` → Logs：查看寄信紀錄與錯誤。
   - **Database** → Publications：確認 Realtime（見第 3 節）。
   - **Project Settings** → API：取得 Project URL、anon key 與 service_role key。

## 3. 建立 Supabase 專案並推送資料庫

1. 在 Supabase Dashboard 建立新專案，記下 Project ref 與資料庫密碼。
2. 在專案資料夾執行（第一次需要先登入 CLI，會開啟瀏覽器授權）：
   ```
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
3. Realtime：migration `20261124000008_realtime.sql` 會把前端訂閱的資料表（weekly_slots、slot_exceptions、bookings、no_class_days、notifications、profiles、semesters、periods）加入 `supabase_realtime` publication，不需要另外手動設定。推送後請到 Dashboard → Database → Publications，確認 `supabase_realtime` 列出這 8 張表；若沒有，畫面不會即時更新（需要重新整理才看得到變動）。
4. 在 Dashboard 的 SQL Editor 設定 vault 密碼：
   ```
   select vault.create_secret('https://xxxx.supabase.co', 'edge_base_url');
   select vault.create_secret('<service_role key>', 'service_role_key');
   ```
   - `edge_base_url` 是專案網址，結尾不要加斜線（例如 `https://xxxx.supabase.co`）。
   - `service_role_key` 必須是「舊版 JWT 格式」的 service_role key（以 `eyJ` 開頭，Project Settings → API 的 Legacy API Keys 分頁），與 Edge Function 內建的 `SUPABASE_SERVICE_ROLE_KEY` 是同一個值。**不要**使用新式的 `sb_secret_…` 金鑰，否則 Edge Function 會拒絕驗證，寄信會失敗。請勿外流此金鑰。

## 4. 部署寄信的 Edge Function

```
npx supabase secrets set GMAIL_USER=<共用帳號的 Gmail> GMAIL_APP_PASSWORD=<應用程式密碼> APP_URL=<前端網址>
npx supabase functions deploy notify-email
```

## 5. 設定 Google OAuth

1. 在 Google Cloud Console 建立專案，進入「API 和服務」→「OAuth 同意畫面」，User Type 選「**外部（External）**」並填寫應用程式名稱與聯絡信箱。
2. **務必把發布狀態改為「正式版（In production / 發布應用程式）」**。若停留在「測試中（Testing）」，只有被列為測試使用者的帳號能登入，其他同學會被擋在外面。
3. 建立 OAuth 用戶端 ID（類型：網頁應用程式），「已授權的重新導向 URI」填入 `https://<project-ref>.supabase.co/auth/v1/callback`。
4. 在 Supabase Dashboard → Authentication → Providers → Google，填入 Client ID 與 Secret 並啟用。
5. 在 Authentication → URL Configuration，把 Site URL 設為前端網址（Cloudflare Pages 網址），並把它加入 Redirect URLs。

注意：`supabase/config.toml` 裡的 `skip_nonce_check = true` 只是本機開發用。雲端專案請在 Dashboard 設定 Google provider，不要啟用這個選項。

## 6. 用 Cloudflare Pages 部署前端

1. 在 Cloudflare Pages 連結此專案的 Git repository。
2. Build command：`npm run build`；Build output directory：`dist`。
3. 環境變數：`VITE_SUPABASE_URL`（專案網址）與 `VITE_SUPABASE_ANON_KEY`（anon key）。正式版建置（`npm run build`）缺少這兩個變數時會直接失敗（`vite.config.ts` 會丟出錯誤），這是預期行為。
   - 本機要執行 `npm run build` 時，需在專案根目錄建立 `.env`（已被 git 忽略，不要提交），內容為這兩個變數。
4. `public/_redirects` 的內容為 `/* /index.html 200`，讓前端路由重新整理時不會 404。

## 7. 設定第一位管理者

老師第一次用 Google 登入（會停在等待審核頁）之後，到 Supabase SQL Editor 執行：

```
select bootstrap_admin('老師的email');
```

之後老師就可以在「管理」頁審核其他成員。

## 8. 部署後驗證（smoke test）

建議在建立「正式學期」**之前**執行；若正式學期已存在，測試學期的日期不可與它重疊（學期日期區間不可重疊，資料庫會拒絕）。測試期間請讓測試用的日期範圍遠離正式學期，例如正式學期是 2026-09-01 ~ 2027-01-31，測試學期可用 2027-03-01 ~ 2027-03-31。

1. **建立測試學期**：以管理者登入，「管理」→「學期」新增測試學期（名稱例如 `TEST`，日期範圍選在未來一個月內且不與正式學期重疊），設為目前學期。
2. **建立兩個測試帳號**：用兩個測試 Google 帳號各登入一次（會停在等待審核頁），再回到管理頁核准：
   - 測試研究生：角色選「研究生」。
   - 測試專題生：角色選「專題生」，指導研究生選剛剛的測試研究生。
3. **設定時段**（兩者必須是同一個星期與同一節）：
   - 老師到「我的可約時段」勾選一格，例如週三第 3 節。
   - 測試研究生到「我的值班時段」勾選相同的格子（週三第 3 節）。
4. **預約**：用測試專題生登入，到預約頁選一個「至少 7 天後」且落在測試學期內的週三第 3 節日期，送出預約。
5. **確認通知**：老師與測試研究生都要收到「待你確認」的 Email（若沒收到，到 Edge Functions → `notify-email` → Logs 查錯），且網站的站內通知鈴鐺有對應通知。
6. **清理**（到 SQL Editor 執行；`<測試學期名稱>` 與 email 請替換）：
   ```
   -- 刪除測試預約（通知會一併連動刪除）
   delete from bookings
     where undergrad_id in (select id from profiles where email in ('測試專題生email', '測試研究生email'))
        or grad_id in (select id from profiles where email = '測試研究生email');
   -- 刪除測試帳號的時段與例外
   delete from weekly_slots
     where user_id in (select id from profiles where email in ('測試專題生email', '測試研究生email'));
   delete from slot_exceptions
     where user_id in (select id from profiles where email in ('測試專題生email', '測試研究生email'));
   -- 刪除老師在測試學期設定的時段（weekly_slots 隨學期連動刪除）
   delete from semesters where name = 'TEST';
   ```
   - 刪除測試學期時，老師在該學期的 `weekly_slots` 會一併刪除。如果測試學期曾被設為目前學期，請先到管理頁把正式學期設為目前學期，或之後再設定。
   - 測試帳號：到「管理」→「成員」按「停用」；或到 Authentication → Users 刪除該使用者（會連動刪除 profile，因此要先完成上面的預約清理）。

## 9. 每學期開學

1. 在「管理」→「學期」新增學期，並設為目前學期。學期的日期區間不可和其他學期重疊（資料庫以 `semesters_no_overlap` 限制，重疊時畫面會提示「學期日期與現有學期重疊」）。
2. 提醒所有人到「我的值班」重新填寫每週格子（新學期不會沿用舊的格子）。
3. 到「停課日」補上該學期的停課日，必要時在「節次時間」調整節次。

### 修改或刪除學期日期

管理頁目前只能新增學期，不能修改日期或刪除。需要時到 SQL Editor 執行：

```
-- 修改日期（新區間仍不可與其他學期重疊）
update semesters set start_date = '2026-09-07', end_date = '2027-01-22' where name = '115-1';

-- 刪除學期（該學期的每週時段會一併刪除；已有預約的學期不建議刪除）
delete from semesters where name = '115-1';
```

## 10. 常見維護

- 寒暑假後若 Supabase 專案被暫停，到 Dashboard 按 Restore 恢復，等待幾分鐘即可。
- 更換 Gmail 應用程式密碼：在 Google 帳號產生新的應用程式密碼，執行 `npx supabase secrets set GMAIL_APP_PASSWORD=<新密碼>`，不需要重新部署。
- 成員離開：在「管理」→「成員」按「停用」，不要刪除資料。

## 11. 本機開發備註

- 本機 Supabase 的連接埠已移到 API 55321、DB 55322，因為這台 Windows 機器保留了 54241-54340 這段連接埠，預設的 543xx 會衝突。
- 前端測試：`npm test -- --run`；資料庫測試：`npx supabase test db`。
- 本機 `npm run build` 需要 `.env`（`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`，值可由 `npx supabase status` 取得）。
