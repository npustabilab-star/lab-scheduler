# 交接文件

本文件說明如何從零部署這個系統，以及日常維護。請依序操作。

## 1. 建立研究室共用 Google 帳號

1. 建立一個研究室共用的 Google 帳號（不要用個人帳號，方便日後交接）。
2. 用這個帳號註冊 Supabase、Cloudflare、Google Cloud（OAuth 用）。
3. 為這個 Google 帳號開啟「兩步驟驗證」。
4. 到 Google 帳號的「安全性」→「應用程式密碼」產生 Gmail 應用程式密碼（16 碼），寄信時會用到。

## 2. 建立 Supabase 專案並推送資料庫

1. 在 Supabase Dashboard 建立新專案，記下 Project ref 與資料庫密碼。
2. 在專案資料夾執行：
   ```
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
3. 在 Dashboard 的 SQL Editor 設定 vault 密碼：
   ```
   select vault.create_secret('https://xxxx.supabase.co', 'edge_base_url');
   select vault.create_secret('<service_role key>', 'service_role_key');
   ```
   - `edge_base_url` 是專案網址，結尾不要加斜線（例如 `https://xxxx.supabase.co`）。
   - `service_role_key` 在 Dashboard 的 Project Settings → API 取得，請勿外流。

## 3. 部署寄信的 Edge Function

```
npx supabase secrets set GMAIL_USER=<共用帳號的 Gmail> GMAIL_APP_PASSWORD=<應用程式密碼> APP_URL=<前端網址>
npx supabase functions deploy notify-email
```

## 4. 設定 Google OAuth

1. 在 Google Cloud Console 建立 OAuth 用戶端（網頁應用程式）。
2. 「已授權的重新導向 URI」填入 `https://<project-ref>.supabase.co/auth/v1/callback`。
3. 在 Supabase Dashboard → Authentication → Providers → Google，填入 Client ID 與 Secret 並啟用。
4. 在 Authentication → URL Configuration，把 Site URL 設為前端網址（Cloudflare Pages 網址），並把它加入 Redirect URLs。

注意：`supabase/config.toml` 裡的 `skip_nonce_check = true` 只是本機開發用。雲端專案請在 Dashboard 設定 Google provider，不要啟用這個選項。

## 5. 用 Cloudflare Pages 部署前端

1. 在 Cloudflare Pages 連結此專案的 Git repository。
2. Build command：`npm run build`；Build output directory：`dist`。
3. 環境變數：`VITE_SUPABASE_URL`（專案網址）與 `VITE_SUPABASE_ANON_KEY`（anon key）。正式版建置缺少這兩個變數時會直接失敗，這是預期行為。
4. `public/_redirects` 的內容為 `/* /index.html 200`，讓前端路由重新整理時不會 404。

## 6. 設定第一位管理者

老師第一次用 Google 登入（會停在等待審核頁）之後，到 Supabase SQL Editor 執行：

```
select bootstrap_admin('老師的email');
```

之後老師就可以在「管理」頁審核其他成員。

## 7. 部署後驗證（smoke test）

1. 在「管理」頁新增一個測試學期並設為目前學期。
2. 用一個測試專題生帳號預約一個時段。
3. 確認老師收到「待你確認」的 Email，且站內通知鈴鐺有通知。
4. 驗證完畢後清理：取消測試預約、刪除測試學期與測試帳號資料。

## 8. 每學期開學

1. 在「管理」→「學期」新增學期，並設為目前學期。學期的日期區間不可和其他學期重疊。
2. 提醒所有人到「我的值班」重新填寫每週格子（新學期不會沿用舊的格子）。
3. 到「停課日」補上該學期的停課日，必要時在「節次時間」調整節次。

## 9. 常見維護

- 寒暑假後若 Supabase 專案被暫停，到 Dashboard 按 Restore 恢復，等待幾分鐘即可。
- 更換 Gmail 應用程式密碼：在 Google 帳號產生新的應用程式密碼，執行 `npx supabase secrets set GMAIL_APP_PASSWORD=<新密碼>`，不需要重新部署。
- 成員離開：在「管理」→「成員」按「停用」，不要刪除資料。

## 10. 本機開發備註

- 本機 Supabase 的連接埠已移到 API 55321、DB 55322，因為這台 Windows 機器保留了 54241-54340 這段連接埠，預設的 543xx 會衝突。
- 前端測試：`npm test -- --run`；資料庫測試：`npx supabase test db`。
