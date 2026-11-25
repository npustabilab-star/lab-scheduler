# 改用學號登入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Google 登入換成「學號＋密碼」，初始密碼為學號後四碼、首次登入強制改密碼，只有管理者新增的學號能登入；通知信改寄到管理者填的選填 Email。

**Architecture:** 沿用 Supabase Auth 的 email/password：每個學號對應一個內部登入 email，前端送密碼時加固定前綴。新增成員與重設密碼由只允許管理者呼叫的 Edge Function `admin-members`（service role）處理；「未改密碼視同未啟用」在資料庫的 `is_active_member()` / `is_admin()` 執行。

**Tech Stack:** 同既有專案（Supabase Postgres + pgTAP、Deno Edge Functions、Vite + React 19 + TS、Vitest）。

**Spec:** `docs/superpowers/specs/2026-11-25-student-id-login-design.md`（補充 `docs/superpowers/specs/2026-11-24-lab-scheduler-design.md`）

## Global Constraints

- 登入 email 格式：`<學號小寫>@users.lab-scheduler.internal`；系統不寄信到這個地址。
- 密碼前綴：`lab-scheduler:`。前端、Edge Function、首位管理者腳本對 Supabase Auth 一律送 `lab-scheduler:` + 使用者輸入的密碼。
- 學號正規化：去頭尾空白、轉小寫。初始密碼 = 正規化學號的最後 4 個字元。
- 新密碼至少 8 碼（因此自然不可能等於 4 碼的初始密碼）。錯誤訊息：`新密碼至少 8 碼`、`兩次輸入的密碼不一致`。
- 登入失敗一律顯示 `學號或密碼錯誤`。
- `must_change_password = true` 的帳號：`is_active_member()` 與 `is_admin()` 都回傳 false（資料庫層級）。
- 學號重複：錯誤代碼 `STUDENT_ID_EXISTS` → `這個學號已經在名單中`。老師 Email 必填：`EMAIL_REQUIRED` → `老師必須填寫 Email`。
- 介面繁體中文、375px 可用；既有規則（loadError/actionError 分離、createLatestOnly）不得退步。
- 本機：Docker 不在 Git Bash PATH（`export PATH="/c/Users/user/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"`）；Supabase 本機 API 55321、DB 55322。
- Commit 訊息結尾空一行加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；不用 --amend；不提交 `.env`。

## Review Focus

1. **未改密碼的帳號直接呼叫 API**：猜中後四碼的人在本人改密碼前讀不到任何資料 → Task 1 `must_change user sees nothing`。
2. **公開註冊沒關掉時有人自行註冊**：只會得到 pending profile，不能變成成員或管理者 → Task 1 `self signup stays pending`。
3. **學號大小寫或前後空白**（如 ` B11234567 `）：視為同一學號 → Task 2 `normalizeStudentId`。
4. **學號少於 4 碼**：拒絕新增（`學號至少 4 碼`）→ Task 2 `validateCreateInput`。
5. **非管理者或未改密碼的管理者呼叫 admin-members**：回 403、不建立帳號 → Task 2 `requireAdmin`。

---

## File Structure

```
supabase/migrations/20261125000010_student_id_login.sql   # profiles 新欄位、is_active_member/is_admin、RPC
supabase/tests/09_student_id.test.sql
supabase/seed.sql                                          # tests.create_user 寫入 student_id、must_change=false
supabase/functions/_shared/credentials.ts                  # 純 TS 帳號工具
supabase/functions/admin-members/{index.ts,logic.ts,logic.test.ts}
supabase/functions/notify-email/index.ts                   # 改讀 notify_email
scripts/create-first-admin.mjs
src/lib/credentials.ts, src/lib/password.ts(+test)
src/pages/LoginPage.tsx, ChangePasswordPage.tsx(新), AdminPage.tsx(+test), PendingPage.tsx
src/lib/routes.ts(+test), api.ts, errors.ts, src/App.tsx
supabase/config.toml, docs/HANDOVER.md, README.md
```

---

### Task 1: 資料庫

**Files:**
- Create: `supabase/migrations/20261125000010_student_id_login.sql`, `supabase/tests/09_student_id.test.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**
- Produces:
  - `profiles.student_id text unique`（既有列可為 null；新成員必填）、`profiles.notify_email text`、`profiles.must_change_password boolean not null default false`。
  - `is_active_member()`、`is_admin()`（`create or replace`）：額外要求 `not must_change_password`。
  - `password_changed() returns void`：清除呼叫者自己的 `must_change_password`；授權 authenticated（必須能被尚未啟用的本人呼叫）。
  - `admin_setup_member(p_user uuid, p_student_id text, p_display_name text, p_role user_role, p_mentor uuid, p_notify_email text, p_is_admin boolean) returns void`：把 profile 設為 active、`must_change_password = true`；學號重複 → `STUDENT_ID_EXISTS`；專題生 mentor 規則同 `approve_user`（`INVALID_MENTOR`）；老師且 email 為空 → `EMAIL_REQUIRED`；第二位老師 → `TEACHER_EXISTS`。**只授權 service_role**。
  - `admin_reset_flag(p_user uuid) returns void`：`must_change_password = true`；只授權 service_role。
  - `set_notify_email(p_user uuid, p_email text) returns void`：限管理者（`NOT_ADMIN`）；空字串存 null；老師不可清空（`EMAIL_REQUIRED`）。
  - `tests.create_user(...)` 簽名不變，額外寫入 `student_id`（email @ 前段）與 `must_change_password = false`，既有測試不用改。
- [ ] **Step 1: 寫失敗測試** `09_student_id.test.sql`（既有檔頭格式）：
  - `must_change user sees nothing`：active 且 `must_change_password=true` 的使用者 `login_as` 後 `is_active_member()` = false、`select count(*) from semesters` = 0、`select count(*) from profiles` = 1。
  - `password_changed clears flag`：呼叫 `password_changed()` 後 `is_active_member()` = true。
  - `setup member is service-role only`：以 authenticated 呼叫 `admin_setup_member` → `throws_ok(..., '42501')`。
  - `duplicate student id`：兩個使用者設定同一學號 → `STUDENT_ID_EXISTS`。
  - `teacher requires email`：`admin_setup_member(..., 'teacher', null, null, true)` → `EMAIL_REQUIRED`。
  - `set_notify_email admin only`：非管理者 → `NOT_ADMIN`；管理者設 `''` → 存成 null。
  - `self signup stays pending`：直接插入 `auth.users` 後 profile `status='pending'`、`is_admin=false`、`student_id is null`。
- [ ] **Step 2:** `npx supabase db reset && npx supabase test db` → 09 FAIL。
- [ ] **Step 3:** 實作 migration 與 seed 修改。
- [ ] **Step 4:** 全部 pgTAP PASS（含既有 01–08）。
- [ ] **Step 5:** commit `feat(db): student id accounts and forced password change`。

### Task 2: 帳號工具、admin-members 函式、寄信、首位管理者腳本

**Files:**
- Create: `supabase/functions/_shared/credentials.ts`, `supabase/functions/admin-members/{index.ts,logic.ts,logic.test.ts}`, `scripts/create-first-admin.mjs`, `src/lib/credentials.ts`
- Modify: `supabase/functions/notify-email/index.ts`

**Interfaces:**
- `_shared/credentials.ts`（純 TS，無 Deno API）：`normalizeStudentId(s: string): string`、`loginEmail(studentId: string): string`、`toAuthPassword(input: string): string`、`initialPassword(studentId: string): string`。
- `src/lib/credentials.ts`：`export * from '../../supabase/functions/_shared/credentials'`；若 tsconfig 不允許跨出 `src`，改為複製一份並加 Vitest 測試斷言兩份對相同輸入輸出相同。
- `admin-members/logic.ts`：
  - `type CreateInput = { student_id: string; display_name: string; role: 'teacher'|'grad'|'undergrad'; mentor_id: string|null; notify_email: string|null }`
  - `validateCreateInput(x: unknown): { ok: true; value: CreateInput } | { ok: false; message: string }`：學號正規化後至少 4 碼（`學號至少 4 碼`）、姓名必填（`請輸入姓名`）、專題生需 mentor_id（`請選擇指導研究生`）、老師需 notify_email（`老師必須填寫 Email`）、Email 格式（`Email 格式不正確`）；空字串 Email 轉 null。
  - `requireAdmin(profile: { status: string; is_admin: boolean; must_change_password: boolean } | null): boolean`
- `admin-members/index.ts`：POST `{ action: 'create', ...CreateInput }` 或 `{ action: 'reset_password', user_id }`。用呼叫者 JWT 取得 user，service client 讀 profile，`requireAdmin` 不過回 403 `{ ok:false, message:'需要管理者權限' }`。
  - create：`auth.admin.createUser({ email: loginEmail(id), password: toAuthPassword(initialPassword(id)), email_confirm: true })` → `rpc('admin_setup_member', …)`；setup 失敗時刪除剛建立的 auth user，回 400 `{ ok:false, message }`（`STUDENT_ID_EXISTS` → `這個學號已經在名單中`；auth 回「已註冊」也回同一訊息）。
  - reset_password：讀該 user 的 `student_id` → `auth.admin.updateUserById(id, { password: toAuthPassword(initialPassword(student_id)) })` → `rpc('admin_reset_flag')`。
  - 成功回 `{ ok: true }`；處理 CORS（瀏覽器直接呼叫）。
- `notify-email/index.ts`：收件地址改用 `profiles.notify_email`；為 null 時設 `emailed_at = now()`、回 200 `{ skipped: 'no email' }`，不呼叫 SMTP。
- `scripts/create-first-admin.mjs`：`node scripts/create-first-admin.mjs <代碼> <姓名> <Email> <密碼>`，讀 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`；建立 auth user（loginEmail / toAuthPassword(密碼)）→ `admin_setup_member(..., 'teacher', null, Email, true)` → 直接把該 profile 的 `must_change_password` 設為 false（老師用自己指定的密碼）。密碼少於 8 碼拒絕執行。不得印出金鑰。
- [ ] **Step 1: 寫失敗測試** `logic.test.ts`：
  - `normalizeStudentId(' B11234567 ') === 'b11234567'`；`initialPassword('B11234567') === '4567'`；`loginEmail('B11234567') === 'b11234567@users.lab-scheduler.internal'`；`toAuthPassword('4567') === 'lab-scheduler:4567'`。
  - `validateCreateInput({student_id:'123', display_name:'a', role:'grad'})` → `{ok:false, message:'學號至少 4 碼'}`；專題生缺 mentor → `請選擇指導研究生`；老師缺 email → `老師必須填寫 Email`；`notify_email:'abc'` → `Email 格式不正確`；`{student_id:' B11234567 ', display_name:'王', role:'grad', notify_email:''}` → ok，value 為 `{student_id:'b11234567', display_name:'王', role:'grad', mentor_id:null, notify_email:null}`。
  - `requireAdmin(null)` → false；`{status:'active', is_admin:true, must_change_password:true}` → false；`{status:'active', is_admin:true, must_change_password:false}` → true。
- [ ] **Step 2:** `npx vitest --run supabase/functions` → FAIL。
- [ ] **Step 3:** 實作。
- [ ] **Step 4:** Vitest PASS；`npx supabase functions serve` 啟動無錯；`npx tsc -b` clean。
- [ ] **Step 5:** commit `feat(fn): admin-members function and student id credentials`。

### Task 3: 前端

**Files:**
- Create: `src/pages/ChangePasswordPage.tsx`, `src/lib/password.ts`, `src/lib/password.test.ts`
- Modify: `src/pages/LoginPage.tsx`, `src/pages/AdminPage.tsx`, `src/pages/AdminPage.test.tsx`, `src/pages/PendingPage.tsx`, `src/lib/routes.ts`, `src/lib/routes.test.ts`, `src/lib/api.ts`, `src/lib/errors.ts`, `src/App.tsx`, `supabase/config.toml`, `src/lib/database.types.ts`（`npm run gen:types`）

**Interfaces:**
- Consumes: Task 1 RPC（`password_changed`, `set_notify_email`）、Task 2 `src/lib/credentials.ts`、`admin-members` 函式。
- `validateNewPassword(pw: string, confirm: string): string | null`。
- `routes.ts`：`homeFor(p)` 在 `p.status === 'active' && p.must_change_password` 時回 `'/change-password'`；Guard 讓這種帳號只能到 `/change-password`。
- `api.ts`：`createMember(input: CreateInput): Promise<void>`、`resetMemberPassword(userId: string): Promise<void>`（經 `supabase.functions.invoke('admin-members')`，`ok:false` 時 throw `AppError`，message 用函式回傳的中文）、`setNotifyEmail(userId: string, email: string): Promise<void>`。
- `errors.ts` 新增 `STUDENT_ID_EXISTS`、`EMAIL_REQUIRED`（訊息見 Global Constraints）。
- LoginPage：學號、密碼兩欄＋「登入」；`signInWithPassword({ email: loginEmail(id), password: toAuthPassword(pw) })`；任何錯誤顯示 `學號或密碼錯誤`。
- ChangePasswordPage：標題 `請設定新密碼`、說明 `第一次登入需要先更改密碼`；新密碼＋確認；`validateNewPassword` → `supabase.auth.updateUser({ password: toAuthPassword(pw) })` → `rpc('password_changed')` → `refresh()`。
- AdminPage「成員」分頁：移除待審核區塊；新增「新增成員」表單（學號、姓名、身分〔研究生／專題生／老師〕、指導研究生〔專題生時〕、Email 選填〔老師時必填〕）；成員列顯示學號，新增「重設密碼」（確認對話框文字：`確定要把 <姓名> 的密碼重設為學號後四碼？`）與 Email 編輯。
- `config.toml`：移除 `[auth.external.google]` 與 `skip_nonce_check`；`[auth] enable_signup = false`；`[auth.email] enable_confirmations = false`。
- [ ] **Step 1: 寫失敗測試**：
  - `password.test.ts`：`('1234567','1234567')` → `新密碼至少 8 碼`；`('abcdefgh','abcdefgx')` → `兩次輸入的密碼不一致`；`('abcdefgh','abcdefgh')` → null。
  - `routes.test.ts`：`homeFor({status:'active', role:'grad', is_admin:false, must_change_password:true, …})` → `'/change-password'`。
  - `AdminPage.test.tsx`：選「專題生」未選指導研究生按新增 → 顯示 `請選擇指導研究生` 且不呼叫 `createMember`；選「研究生」填學號 `B11234567`、姓名 `王小明` → 呼叫 `createMember({student_id:'B11234567', display_name:'王小明', role:'grad', mentor_id:null, notify_email:null})`；`createMember` 拋 `AppError('STUDENT_ID_EXISTS')` → 顯示 `這個學號已經在名單中`；按重設密碼並確認 → 呼叫 `resetMemberPassword(id)`。
  - `pages.test.tsx`：LoginPage `signInWithPassword` 回錯 → 顯示 `學號或密碼錯誤`；ChangePasswordPage 兩次不一致 → 顯示錯誤且不呼叫 `updateUser`。
- [ ] **Step 2:** `npx vitest --run` → 新測試 FAIL。
- [ ] **Step 3:** 實作。
- [ ] **Step 4:** `npx vitest --run`、`npx tsc -b`、`npm run build`（本機 `.env`）全部通過。
- [ ] **Step 5:** commit `feat(web): student id login, forced password change, member management`。

### Task 4: 交接文件

**Files:** Modify `docs/HANDOVER.md`, `README.md`

- [ ] **Step 1:** HANDOVER 改寫（繁中）：
  - Supabase Dashboard 登入：用共用 Gmail 以 Email＋密碼註冊（Sign up），不是 Google。
  - `db push` 一律加 `--remote`（CLI 預設推本機）。
  - Supabase Dashboard → Authentication：關閉「Allow new users to sign up」、Email provider 開啟、關閉「Confirm email」。
  - 部署兩個函式：`npx supabase functions deploy notify-email --project-ref <ref>` 與 `admin-members`。
  - 建立第一位管理者：PowerShell `$env:SUPABASE_URL=…; $env:SUPABASE_SERVICE_ROLE_KEY=…; node scripts/create-first-admin.mjs teacher 老師姓名 老師Email 初始密碼`，取代 `bootstrap_admin`。
  - 刪除整個 Google OAuth 章節。
  - 前端部署改為 Cloudflare Workers：用雲端值建置（`$env:VITE_SUPABASE_URL=…; $env:VITE_SUPABASE_ANON_KEY=…; npm run build`）後 `npx wrangler login`、`npx wrangler deploy`（`wrangler.jsonc` 已設 SPA fallback）；刪除 `_redirects` 說明。
  - 日常：新增成員、重設密碼、修改 Email 的位置；忘記密碼 = 管理者重設。
  - smoke test 改用學號帳號（新增測試研究生／專題生、首登改密碼、預約、確認老師收到信），清理 SQL 改用 `student_id` 篩選；在 Authentication → Users 刪測試帳號要先刪專題生再刪研究生。
- [ ] **Step 2:** README 本機開發段落改成學號登入（本機可用 `scripts/create-first-admin.mjs` 指向 `http://127.0.0.1:55321`）。
- [ ] **Step 3:** commit `docs: handover for student id login and workers deploy`。
