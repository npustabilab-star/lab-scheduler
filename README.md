# 研究室值班與會議預約系統

研究室的值班表與會議預約網站：研究生與老師填寫每週可值班／可約時段，專題生從開放的時段預約會議，老師與指導研究生確認後成立，並寄出 Email 與站內通知。成員以「學號 + 密碼」登入，由管理者建立帳號。前端為 Vite + React + TypeScript + Tailwind，後端為 Supabase（Postgres、Auth、Realtime、Edge Function），前端部署在 Cloudflare Workers。

## 本機開發快速開始

以下指令在 PowerShell、`lab-scheduler` 資料夾內執行。

1. 安裝並啟動 Docker Desktop。
2. 啟動本機 Supabase：`npx supabase start`
3. 複製 `.env.example` 為 `.env`，把 `npx supabase status` 顯示的 API URL 與 anon key 填入 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
4. 安裝套件：`npm install`（下一步的腳本需要它）。
5. 建立第一位管理者（本機服務的 API 在 `http://127.0.0.1:55321`，service_role key 由 `npx supabase status` 取得）：
   ```powershell
   $env:SUPABASE_URL = "http://127.0.0.1:55321"
   $env:SUPABASE_SERVICE_ROLE_KEY = "<npx supabase status 顯示的 service_role key>"
   node scripts/create-first-admin.mjs teacher 老師姓名 teacher@example.com 12345678
   ```
6. 啟動：`npm run dev`，用學號 `teacher` 與剛才設定的密碼登入；其他成員由「管理」頁新增（初始密碼為學號後四碼，第一次登入需改密碼）。
7. 前端測試：`npm test -- --run`
8. 資料庫測試：`npx supabase test db`（需要乾淨的資料庫；若本機建立過使用者，請先 `npx supabase db reset`）

## 部署與交接

部署步驟、每學期操作與常見問題請見 [docs/HANDOVER.md](docs/HANDOVER.md)。
