# 研究室值班與會議預約系統

研究室的值班表與會議預約網站：研究生與老師填寫每週可值班／可約時段，專題生從開放的時段預約會議，老師與指導研究生確認後成立，並寄出 Email 與站內通知。前端為 Vite + React + TypeScript + Tailwind，後端為 Supabase（Postgres、Auth、Realtime、Edge Function）。

## 本機開發快速開始

1. 安裝並啟動 Docker Desktop。
2. 啟動本機 Supabase：`npx supabase start`
3. 複製 `.env.example` 為 `.env`，把 `npx supabase status` 顯示的 API URL 與 anon key 填入 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
4. 安裝套件並啟動：`npm install`、`npm run dev`
5. 前端測試：`npm test -- --run`
6. 資料庫測試：`npx supabase test db`

## 部署與交接

部署步驟、每學期操作與常見問題請見 [docs/HANDOVER.md](docs/HANDOVER.md)。
