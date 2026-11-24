# 研究室排班與預約系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一個網頁系統：研究生依課表勾選值班節次並即時彙整成總表、行事曆顯示值班與會議、專題生提前一週預約老師＋指導研究生並經兩人確認。

**Architecture:** 所有規則（誰在、可約時段、雙重預約、一人一筆、異動取消、通知、逾期）都放在 Postgres（Supabase）的 SQL 函式與限制裡，前端只呼叫 RPC 並顯示結果，即時更新靠 Supabase Realtime 觸發重新查詢。寄信由通知表的 INSERT 觸發 Edge Function，透過 Gmail SMTP 寄出；逾期由 pg_cron 每小時執行。

**Tech Stack:** Vite + React 18 + TypeScript、React Router 6、Tailwind CSS 4、FullCalendar 6（daygrid/timegrid）、@supabase/supabase-js 2、Supabase CLI（本機開發）、pgTAP（`supabase test db`）、Vitest + React Testing Library、Supabase Edge Functions（Deno）+ denomailer、Cloudflare Pages。

**Spec:** `docs/superpowers/specs/2026-11-24-lab-scheduler-design.md`

## Global Constraints

- 專案根目錄：`C:\Users\user\Desktop\ABI-Agent\lab-scheduler`（以下路徑皆相對於此）。
- 開發需求：Node 20+、Docker Desktop（Supabase 本機環境需要）。
- 介面文字全部使用繁體中文；手機寬度 375px 必須可正常操作，不可出現水平捲動。
- 時區固定 Asia/Taipei。所有「今天／現在」只能透過 `taipei_now()`／`taipei_today()` 取得（測試時用 `set local app.now = '...'` 覆寫）。
- 星期以 ISO 編號：1=週一 … 5=週五；節次 1～8。
- 預設節次時間（可由管理者修改）：1 08:10–09:00、2 09:10–10:00、3 10:10–11:00、4 11:10–12:00、5 13:10–14:00、6 14:10–15:00、7 15:10–16:00、8 16:10–17:00。
- 預約日期必須 ≥ `taipei_today() + 7`，且在目前學期內、不是停課日。
- 待確認預約在 `taipei_today() >= 會議日期 - 3` 時自動變成 `expired`。
- 只有一位老師；每位專題生只對應一位指導研究生；專題為個人。
- 同一日期＋節次最多一筆 `pending`／`confirmed` 預約（因為老師出席每一場）。
- 每位專題生同時最多一筆「尚未結束」的 `pending`／`confirmed` 預約；會議結束時刻 = 日期 + 該節 `end_time`。
- 所有寫入都經過 `security definer` 的 RPC 或 RLS 限定的管理者政策；一般使用者不得直接 INSERT／UPDATE `weekly_slots`、`slot_exceptions`、`bookings`、`profiles`。
- 只有帳號狀態 `active` 的人能讀到任何資料；`pending`／`disabled` 只能讀到自己的 profile。
- 前端只能使用 anon key；service role key、Gmail 應用程式密碼只存在 Supabase secrets／vault。
- RPC 錯誤以 `raise exception '<CODE>'` 回傳固定代碼，前端用 `rpcErrorMessage(code)` 轉成中文訊息。
- 每個 pgTAP 測試檔開頭：`begin; create extension if not exists pgtap with schema extensions; select plan(N);`，結尾 `select * from finish(); rollback;`。

## Review Focus

1. **兩位專題生幾乎同時送出同一節**：只能成功一筆，另一筆得到 `SLOT_UNAVAILABLE`，不能出現兩筆。→ Task 4 測試 `second active booking on same slot violates unique index`。
2. **台灣時間與 UTC 跨日**：UTC 16:30 已經是台灣隔天 00:30，「今天＋7」必須用台灣日期算。→ Task 2 測試 `taipei_today uses Taipei date across UTC midnight`。
3. **停課日或學期外的日期**：不能出現在可約時段，也不能被標成「整天無人」。→ Task 3 `uncovered_days skips no-class days and out-of-semester dates`、Task 4 `available_slots excludes no-class day`。
4. **已經開完的會議不能擋住下一次預約**：過去的 confirmed 預約不算「進行中」。→ Task 4 `past confirmed booking does not block a new one`。
5. **指導研究生被停用後**：他的格子不再算值班，他帶的專題生看不到可約時段，送出時得到 `NO_MENTOR`。→ Task 5 `disabled mentor yields NO_MENTOR`。

---

## File Structure

```
lab-scheduler/
  package.json, vite.config.ts, vitest.config.ts, tsconfig.json, index.html, .env.example
  supabase/
    config.toml
    seed.sql                         # 僅本機：tests.* 測試輔助函式
    migrations/
      20261124000001_schema.sql      # enums、資料表、預設節次、時間函式、身分輔助函式
      20261124000002_profiles.sql    # 新使用者觸發器、profiles RLS、管理者 RPC
      20261124000003_presence.sql    # is_present、roster、uncovered_days、相關 RLS
      20261124000004_bookings.sql    # bookings、唯一索引、available_slots、create/respond/cancel
      20261124000005_changes.sql     # 會影響預約的異動 RPC（先警告再取消）
      20261124000006_notifications.sql # notifications、觸發器、逾期、pg_cron、pg_net 寄信觸發
    tests/
      00_smoke.test.sql 01_profiles.test.sql 02_presence.test.sql 03_bookings.test.sql
      04_changes.test.sql 05_notifications.test.sql
    functions/notify-email/
      index.ts                       # Deno 入口：讀資料、寄信、寫 emailed_at
      email.ts                       # 純函式 buildEmail（Vitest 測試）
      email.test.ts
  src/
    main.tsx, App.tsx, index.css
    lib/supabase.ts, lib/database.types.ts（產生檔）, lib/api.ts, lib/errors.ts,
        lib/grid.ts, lib/changes.ts, lib/routes.ts, lib/calendar.ts, lib/booking.ts
    auth/AuthProvider.tsx
    hooks/useTableChanges.ts
    components/WeekGrid.tsx, ImpactDialog.tsx, NotificationBell.tsx, Layout.tsx
    pages/LoginPage.tsx, PendingPage.tsx, MyGridPage.tsx, MasterPage.tsx,
          CalendarPage.tsx, BookingPage.tsx, RequestsPage.tsx, AdminPage.tsx
    **/*.test.ts(x)                  # 與被測檔案放在一起
  docs/HANDOVER.md
```

---

### Task 1: 專案骨架與測試環境

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `.env.example`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/lib/smoke.test.ts`, `supabase/config.toml`, `supabase/tests/00_smoke.test.sql`

**Interfaces:**
- Produces: `npm test`（Vitest，include `src/**/*.test.ts(x)` 與 `supabase/functions/**/*.test.ts`，environment jsdom）、`npx supabase test db`、`npm run gen:types`（= `supabase gen types typescript --local > src/lib/database.types.ts`）。

- [ ] **Step 1:** 在 `lab-scheduler` 執行 `git init`；以 `npm create vite@latest . -- --template react-ts` 建立專案（保留已存在的 `docs/`）；安裝 `react-router-dom@6 @supabase/supabase-js@2 @fullcalendar/core@6 @fullcalendar/react@6 @fullcalendar/daygrid@6 @fullcalendar/timegrid@6 @fullcalendar/interaction@6 tailwindcss@4 @tailwindcss/vite@4`，dev：`vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event supabase`。
- [ ] **Step 2:** `npx supabase init`；在 `config.toml` 啟用 Google auth provider（`[auth.external.google] enabled = true`，client id/secret 讀 `env(GOOGLE_CLIENT_ID)`／`env(GOOGLE_SECRET)`），`site_url = "http://localhost:5173"`。
- [ ] **Step 3:** 寫 smoke 測試：`src/lib/smoke.test.ts` 斷言 `1+1===2`；`supabase/tests/00_smoke.test.sql` 依 Global Constraints 的格式，`plan(1)`，斷言 `select has_extension('pgtap')`。
- [ ] **Step 4:** 執行 `npx supabase start`、`npm test -- --run`、`npx supabase test db`。預期：兩者皆 PASS。
- [ ] **Step 5:** `.gitignore` 加入 `.env`、`supabase/.temp`；commit `chore: scaffold vite + supabase`。

---

### Task 2: 資料表結構、帳號與管理者權限

**Files:**
- Create: `supabase/migrations/20261124000001_schema.sql`, `supabase/migrations/20261124000002_profiles.sql`, `supabase/seed.sql`, `supabase/tests/01_profiles.test.sql`

**Interfaces:**
- Produces（SQL）：下列型別與資料表；`taipei_now() returns timestamp`、`taipei_today() returns date`、`is_active_member() returns boolean`、`is_admin() returns boolean`、`the_teacher() returns uuid`（唯一 active teacher）、`current_semester() returns semesters`、`approve_user(p_user uuid, p_role user_role, p_mentor uuid default null) returns void`、`set_admin(p_user uuid, p_is_admin boolean) returns void`、`bootstrap_admin(p_email text) returns void`。
- Produces（測試輔助，`seed.sql`，schema `tests`）：`tests.create_user(p_email text, p_role user_role, p_status account_status default 'active', p_admin boolean default false, p_mentor uuid default null) returns uuid`、`tests.login_as(p_user uuid) returns void`（`set local role authenticated` 並設定 `request.jwt.claims` 的 `sub`）、`tests.logout() returns void`（`reset role`）。

資料表結構是這份計畫的決定，照抄：

```sql
create type user_role as enum ('teacher','grad','undergrad');
create type account_status as enum ('pending','active','disabled');
create type booking_status as enum ('pending','confirmed','rejected','cancelled','expired');
create type notification_type as enum ('booking_requested','booking_confirmed','booking_rejected','booking_cancelled','booking_expired');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  display_name text not null,
  role user_role,                       -- 待審核時為 null
  status account_status not null default 'pending',
  is_admin boolean not null default false,
  mentor_id uuid references profiles,   -- 只有 undergrad 使用
  created_at timestamptz not null default now()
);
create table semesters (
  id bigint generated always as identity primary key,
  name text not null, start_date date not null, end_date date not null,
  is_current boolean not null default false, check (end_date >= start_date)
);
create unique index one_current_semester on semesters (is_current) where is_current;
create table periods (period smallint primary key check (period between 1 and 8),
  start_time time not null, end_time time not null);
-- 插入 Global Constraints 的 8 節預設時間
create table no_class_days (date date primary key, note text not null default '');
create table weekly_slots (
  user_id uuid references profiles on delete cascade,
  semester_id bigint references semesters on delete cascade,
  weekday smallint check (weekday between 1 and 5),
  period smallint check (period between 1 and 8),
  primary key (user_id, semester_id, weekday, period));
create table slot_exceptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles on delete cascade,
  date date not null,
  period smallint check (period between 1 and 8),   -- null = 整天
  unique nulls not distinct (user_id, date, period));
```

（`bookings`、`notifications` 在 Task 4、6 建立。）

- [ ] **Step 1: 寫失敗測試** `01_profiles.test.sql`，至少包含：
  - `new auth user gets pending profile`：插入 `auth.users`（email `a@x.com`，`raw_user_meta_data` 含 `full_name`='阿文'）後，`profiles` 有一筆 `status='pending'`、`role is null`、`display_name='阿文'`。
  - `pending user sees only own profile`：另建一位 active 使用者；以 pending 使用者 `tests.login_as` 後 `select count(*) from profiles` = 1。
  - `active user sees all profiles`：count = 2（以上述資料）。
  - `non-admin cannot approve`：`throws_ok($$select approve_user(...)$$, 'NOT_ADMIN')`。
  - `admin approves undergrad with mentor`：管理者呼叫 `approve_user(u, 'undergrad', grad)` 後，`status='active'`、`role='undergrad'`、`mentor_id=grad`。
  - `undergrad approval requires active grad mentor`：mentor 傳 null 或傳 teacher → `throws_ok(..., 'INVALID_MENTOR')`。
  - `second teacher rejected`：已有 active teacher 時 `approve_user(x,'teacher')` → `'TEACHER_EXISTS'`。
  - `cannot remove last admin`：唯一管理者 `set_admin(自己, false)` → `'LAST_ADMIN'`。
  - `bootstrap only once`：已有管理者時 `bootstrap_admin('b@x.com')` → `'ALREADY_BOOTSTRAPPED'`。
  - `taipei_today uses Taipei date across UTC midnight`：`set local app.now = '2026-03-02 00:30'` 後 `taipei_today() = '2026-03-02'`；`reset app.now` 後 `date_trunc('minute', taipei_now()) = date_trunc('minute', now() at time zone 'Asia/Taipei')`。
- [ ] **Step 2:** `npx supabase db reset && npx supabase test db`，預期 01 FAIL（函式／表不存在）。
- [ ] **Step 3:** 實作 migration 01、02 與 seed.sql：
  - `taipei_now()`：`coalesce(nullif(current_setting('app.now', true), '')::timestamp, now() at time zone 'Asia/Taipei')`；`taipei_today()` = `taipei_now()::date`。
  - `auth.users` AFTER INSERT 觸發器 `handle_new_user()` 建立 profile，`display_name` 取 `raw_user_meta_data->>'full_name'`，沒有就用 email `@` 前段。
  - profiles RLS：`select` 允許 `id = auth.uid()` 或 `is_active_member()`；沒有 insert/update/delete 政策。
  - `approve_user`、`set_admin`：`security definer`，非管理者 `raise exception 'NOT_ADMIN'`。
  - semesters／periods／no_class_days RLS：active 成員可 select；`semesters`、`periods` 的 insert/update/delete 限 `is_admin()`（`no_class_days` 的寫入走 Task 5 RPC）。
  - `bootstrap_admin`：只在系統中尚無管理者時可執行，把該 email 的使用者設為 active teacher 且 is_admin。`revoke execute ... from authenticated, anon`，只能在 SQL Editor 以 postgres 執行。
- [ ] **Step 4:** `npx supabase test db`，預期 PASS。
- [ ] **Step 5:** commit `feat(db): schema, profiles, admin rpc`。

---

### Task 3: 值班計算（誰在、每日名單、整天無人）

**Files:**
- Create: `supabase/migrations/20261124000003_presence.sql`, `supabase/tests/02_presence.test.sql`

**Interfaces:**
- Consumes: Task 2 的資料表與 `taipei_today()`、`current_semester()`。
- Produces:
  - `is_present(p_user uuid, p_date date, p_period smallint) returns boolean`：使用者 active、日期在某學期內且為週一～五、不是停課日、該學期 `weekly_slots` 有 (isodow, period)，而且沒有對應的 `slot_exceptions`（同節次或整天）。
  - `roster(p_from date, p_to date) returns table(date date, user_id uuid, period smallint)`：區間內所有 active **研究生**實際在場的節次。
  - `uncovered_days(p_from date, p_to date) returns setof date`：區間內屬於某學期、週一～五、非停課日，而且 `roster` 那天沒有任何列的日期。
  - 三者皆 `stable security definer`，非 active 成員呼叫時回傳空集合或 false。
  - RLS：`weekly_slots`、`slot_exceptions` active 成員可 select，沒有寫入政策。

- [ ] **Step 1: 寫失敗測試** `02_presence.test.sql`。固定資料：學期 `2026-02-16`～`2026-06-30`（is_current）、研究生 G 有 `(weekday 1, period 3)`、`(1,4)`；老師 T 有 `(1,3)`。
  - `present on weekly slot`：`is_present(G,'2026-03-02',3)` = true；`(G,'2026-03-02',5)` = false；`(G,'2026-03-03',3)` = false。
  - `exception for one period`：新增例外 (G,'2026-03-02',3) → 第 3 節 false、第 4 節仍 true。
  - `whole-day exception`：例外 (G,'2026-03-09',null) → 第 3、4 節皆 false。
  - `roster lists grads only`：`roster('2026-03-02','2026-03-02')` 只含 G 的列，不含 T。
  - `uncovered_days basic`：`uncovered_days('2026-03-02','2026-03-08')` = `{2026-03-03,2026-03-04,2026-03-05,2026-03-06}`（不含週末）。
  - `uncovered_days skips no-class days and out-of-semester dates`：加停課日 `2026-03-04` → 結果不含 03-04；`uncovered_days('2026-07-01','2026-07-03')` 為空。
  - `disabled grad not present`：把 G 設成 disabled → `is_present(G,'2026-03-02',4)` = false，`2026-03-02` 出現在 `uncovered_days`。
- [ ] **Step 2:** 執行 `npx supabase db reset && npx supabase test db`，預期 02 FAIL。
- [ ] **Step 3:** 實作 migration 03（用 `generate_series` 產生日期，`extract(isodow from d)` 對應 weekday）。
- [ ] **Step 4:** 執行測試，預期 PASS。
- [ ] **Step 5:** commit `feat(db): presence, roster, uncovered days`。

---

### Task 4: 預約核心（可約時段、送出、確認、取消）

**Files:**
- Create: `supabase/migrations/20261124000004_bookings.sql`, `supabase/tests/03_bookings.test.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: `is_present`、`the_teacher()`、`taipei_now()`、`taipei_today()`、`current_semester()`。
- Produces:

```sql
create table bookings (
  id uuid primary key default gen_random_uuid(),
  undergrad_id uuid not null references profiles,
  teacher_id uuid not null references profiles,
  grad_id uuid not null references profiles,
  date date not null,
  period smallint not null references periods,
  note text not null default '',
  status booking_status not null default 'pending',
  teacher_ok boolean not null default false,
  grad_ok boolean not null default false,
  reason text,                              -- 拒絕／取消原因
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create unique index bookings_active_slot on bookings (date, period)
  where status in ('pending','confirmed');
```

  - `booking_is_upcoming(b bookings) returns boolean`：`b.date + (select end_time from periods where period = b.period) > taipei_now()`。
  - `available_slots() returns table(date date, period smallint)`：呼叫者須為 active undergrad 且有 active mentor（否則回傳空集合）；日期從 `taipei_today()+7` 到目前學期 `end_date`；同時 `is_present(the_teacher(), d, p)` 與 `is_present(mentor, d, p)`；排除已有 pending/confirmed 的 (date, period)。依 date, period 排序。
  - `create_booking(p_date date, p_period smallint, p_note text default '') returns uuid`：依序檢查並回傳錯誤代碼：`NOT_UNDERGRAD`、`NO_MENTOR`（沒有 mentor 或 mentor 非 active）、`TOO_SOON`（`p_date < taipei_today()+7`）、`HAS_ACTIVE_BOOKING`（先 `select ... from profiles where id = auth.uid() for update` 鎖住本人，再檢查是否有 upcoming 的 pending/confirmed）、`SLOT_UNAVAILABLE`（(p_date,p_period) 不在 `available_slots()`；捕捉到 `unique_violation` 時也轉成這個代碼）。
  - `respond_booking(p_booking uuid, p_accept boolean, p_reason text default null) returns booking_status`：呼叫者須是該筆的 teacher 或 grad（否則 `NOT_PARTICIPANT`），狀態須為 pending（否則 `NOT_PENDING`）。同意時設定自己的 `*_ok`，兩者皆 true 就變 `confirmed`；拒絕時變 `rejected` 並寫入 reason。
  - `cancel_booking(p_booking uuid, p_reason text default null) returns void`：三位參與者之一（否則 `NOT_PARTICIPANT`），狀態為 pending 或 confirmed 且 upcoming（否則 `NOT_CANCELLABLE`），變 `cancelled`。
  - `cancel_bookings_internal(p_ids uuid[], p_reason text) returns void`：不授權給 authenticated，供 Task 5、6 使用。
  - RLS select：active 成員可看 `status='confirmed'`；其他狀態只限三位參與者。沒有寫入政策。
  - 每次 UPDATE 由觸發器更新 `updated_at`。
  - seed.sql 新增 `tests.make_booking(p_undergrad uuid, p_date date, p_period smallint, p_status booking_status default 'confirmed') returns uuid`：以 postgres 身分直接插入，teacher_id 取 `the_teacher()`，grad_id 取該專題生的 mentor，`teacher_ok`／`grad_ok` 在 confirmed 時為 true。

- [ ] **Step 1: 寫失敗測試** `03_bookings.test.sql`。沿用 Task 3 的學期與格子（T、G 都有 (1,3)），專題生 U（mentor=G）、另一位專題生 U2（mentor=G）、研究生 G2，`set local app.now = '2026-03-02 09:00'`。
  - `available_slots for undergrad`：以 U 登入，結果包含 `('2026-03-09',3)`，不含 `('2026-03-02',3)`（未滿 7 天），不含 `('2026-03-09',4)`（老師不在）。
  - `available_slots excludes no-class day`：加停課日 `2026-03-16` → 不含 `('2026-03-16',3)`。
  - `create_booking happy path`：U 預約 `('2026-03-09',3,'討論題目')` 回傳 uuid，該列 `status='pending'`、`teacher_id=T`、`grad_id=G`。
  - `too soon`：`create_booking('2026-03-06',3)` → `TOO_SOON`。
  - `one active booking per undergrad`：U 再約 `('2026-03-23',3)` → `HAS_ACTIVE_BOOKING`。
  - `slot taken by pending booking`：U2 約 `('2026-03-09',3)` → `SLOT_UNAVAILABLE`，而且 U2 的 `available_slots()` 不含它。
  - `second active booking on same slot violates unique index`：以 postgres 身分直接插入第二筆 `(2026-03-09,3,'pending')` → `throws_ok(..., '23505')`。
  - `past confirmed booking does not block a new one`：`tests.make_booking(U2,'2026-02-23',3)`；U2 `create_booking('2026-03-23',3)` 成功。
  - `both must accept`：T `respond_booking(b,true)` → 回傳 `pending`；G `respond_booking(b,true)` → `confirmed`。
  - `reject frees slot`：一筆新的 pending 被 G 拒絕（reason '那天要考試'）→ `status='rejected'`、`reason='那天要考試'`，該時段重新出現在 `available_slots()`。
  - `outsider cannot respond`：U2 對 U 的預約 `respond_booking` → `NOT_PARTICIPANT`。
  - `pending hidden from others, confirmed visible`：G2 登入，看不到 pending 那筆，看得到 confirmed 那筆。
  - `cancel confirmed`：U `cancel_booking(b,'生病')` → `cancelled`；再取消一次 → `NOT_CANCELLABLE`。
- [ ] **Step 2:** 執行測試，預期 03 FAIL。
- [ ] **Step 3:** 實作 migration 04 與 seed 輔助函式。
- [ ] **Step 4:** 執行測試，預期 PASS。
- [ ] **Step 5:** commit `feat(db): bookings and booking rpc`。

---

### Task 5: 會影響預約的異動（先警告、再取消）

**Files:**
- Create: `supabase/migrations/20261124000005_changes.sql`, `supabase/tests/04_changes.test.sql`

**Interfaces:**
- Consumes: `cancel_bookings_internal`、`booking_is_upcoming`、`is_admin()`。
- Produces：每個 RPC 都有 `p_confirm boolean default false`，回傳 `jsonb`：
  `{"applied": boolean, "affected": [{"id": uuid, "date": "YYYY-MM-DD", "period": int, "undergrad_name": text, "status": "pending"|"confirmed"}]}`
  所有 RPC 用同一套規則：先找出「異動後會變得不可行、而且還沒結束的 pending/confirmed 預約」。如果有這種預約而且 `p_confirm=false`，就**不做任何變更**，回傳 `applied=false` 和預約清單；否則套用變更，以下列固定原因呼叫 `cancel_bookings_internal`，回傳 `applied=true` 和被取消的清單。
  - `set_weekly_slot(p_weekday smallint, p_period smallint, p_on boolean, p_confirm boolean default false)`：限 active teacher／grad（否則 `NOT_ALLOWED`），作用於目前學期。`p_on=false` 時，受影響的是呼叫者為 teacher_id 或 grad_id、isodow=weekday、period 相同的預約。原因：`'時段異動：參與者該時段不在'`。
  - `add_exception(p_date date, p_period smallint, p_confirm boolean default false)`：`p_period` 為 null 代表整天。限 teacher／grad。原因同上。
  - `remove_exception(p_date date, p_period smallint) returns void`：不影響任何預約，直接刪除。
  - `add_no_class_day(p_date date, p_note text, p_confirm boolean default false)`：限管理者（`NOT_ADMIN`）。受影響的是那天所有預約。原因：`'停課日'`。
  - `remove_no_class_day(p_date date) returns void`：限管理者。
  - `set_mentor(p_undergrad uuid, p_grad uuid, p_confirm boolean default false)`：限管理者；p_grad 必須是 active grad（否則 `INVALID_MENTOR`）。受影響的是該專題生的預約。原因：`'更換指導研究生'`。
  - `set_account_status(p_user uuid, p_status account_status, p_confirm boolean default false)`：限管理者；不可停用最後一位管理者（`LAST_ADMIN`）。只有改成 disabled 時才會有受影響的預約，也就是該使用者參與的所有預約。原因：`'帳號停用'`。

- [ ] **Step 1: 寫失敗測試** `04_changes.test.sql`。資料同 Task 4；每個測試先用 `tests.make_booking(U,'2026-03-09',3)` 建立自己的 confirmed 預約 b，測完前取消，彼此互不影響。
  - `weekly slot off warns first`：G `set_weekly_slot(1,3,false)` 回傳 `applied=false`、`affected` 長度 1；`weekly_slots` 仍有 (G,1,3)，b 仍是 confirmed。
  - `weekly slot off with confirm cancels`：`p_confirm=true` → `applied=true`，格子被刪除，b `status='cancelled'`、`reason='時段異動：參與者該時段不在'`。
  - `weekly slot on or unaffected applies immediately`：G `set_weekly_slot(2,5,true)` → `applied=true`、`affected=[]`。
  - `undergrad cannot set slots`：U 呼叫 → `NOT_ALLOWED`。
  - `exception other period no impact`：T `add_exception('2026-03-09',4)` → `applied=true`、`affected=[]`。
  - `whole-day exception warns`：T `add_exception('2026-03-09',null)` → `applied=false`、長度 1。
  - `no-class day by admin cancels with reason`：T（管理者）`add_no_class_day('2026-03-09','校慶',true)` → b 的 `reason='停課日'`。
  - `non-admin no-class day`：G 呼叫 → `NOT_ADMIN`。
  - `set_mentor cancels old bookings`：`set_mentor(U,G2,true)` → b 的 `reason='更換指導研究生'`，U 的 `mentor_id=G2`。
  - `disabled mentor yields NO_MENTOR`：`set_account_status(G,'disabled',true)` 後，U2（mentor=G）的 `available_slots()` 為空，`create_booking('2026-03-16',3)` → `NO_MENTOR`。
  - `past bookings untouched`：`tests.make_booking(U,'2026-02-23',3)` 那筆在 `set_weekly_slot(1,3,false,true)` 之後仍是 confirmed。
- [ ] **Step 2:** 執行測試，預期 04 FAIL。
- [ ] **Step 3:** 實作 migration 05（每個 RPC 先用一個 CTE 找出受影響的 id，再依 `p_confirm` 決定要不要套用）。
- [ ] **Step 4:** 執行測試，預期 PASS。
- [ ] **Step 5:** commit `feat(db): change rpc with impact warning`。

---

### Task 6: 通知、逾期與寄信觸發

**Files:**
- Create: `supabase/migrations/20261124000006_notifications.sql`, `supabase/tests/05_notifications.test.sql`

**Interfaces:**
- Consumes: `bookings`、`taipei_today()`。
- Produces:

```sql
create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles on delete cascade,
  type notification_type not null,
  booking_id uuid not null references bookings on delete cascade,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now());
```

  - 觸發器 `notify_booking_change()`（bookings AFTER INSERT，或 status 有改變的 AFTER UPDATE）：收件人 = {undergrad, teacher, grad} 去掉 `auth.uid()`（系統動作時 `auth.uid()` 為 null，三人都收）。類型對應：insert→`booking_requested`、confirmed→`booking_confirmed`、rejected→`booking_rejected`、cancelled→`booking_cancelled`、expired→`booking_expired`。
  - `mark_notifications_read(p_ids bigint[] default null) returns void`：null 代表全部已讀，只會動到自己的通知。
  - RLS：只能 select 自己的通知。
  - `expire_pending_bookings() returns integer`：把 `status='pending' and taipei_today() >= date - 3` 的預約改成 `expired`，回傳筆數。
  - pg_cron：`select cron.schedule('expire-pending-bookings', '0 * * * *', 'select expire_pending_bookings()')`。
  - 寄信觸發：notifications AFTER INSERT 觸發器 `queue_notification_email()` 呼叫 `net.http_post`，URL = vault 中 `edge_base_url` + `/functions/v1/notify-email`，header `Authorization: Bearer <vault 的 service_role_key>`，body `{"notification_id": <id>}`。vault 裡找不到這兩個值時直接 return，所以本機測試不會寄信。

- [ ] **Step 1: 寫失敗測試** `05_notifications.test.sql`：
  - `request notifies teacher and grad`：U `create_booking` 後，notifications 有 T、G 各一筆 `booking_requested`，U 沒有。
  - `confirm notifies other two`：T 同意、G 同意後，`booking_confirmed` 寄給 U、T（G 是最後動作的人，不收）。
  - `expire after cutoff`：pending 預約 `2026-03-12`；`set local app.now='2026-03-08 23:00'` → `expire_pending_bookings()` = 0；`'2026-03-09 00:10'` → 1，`status='expired'`，三人各收到一筆 `booking_expired`。
  - `user reads only own notifications`：U 登入只看得到自己的列；`mark_notifications_read()` 後自己的 `read_at` 不為 null，別人的仍是 null。
  - `cron job registered`：`select count(*) from cron.job where jobname='expire-pending-bookings'` = 1。
- [ ] **Step 2:** 執行測試，預期 05 FAIL。
- [ ] **Step 3:** 實作 migration 06（`create extension if not exists pg_cron; create extension if not exists pg_net;`）。
- [ ] **Step 4:** 執行測試，預期 PASS。
- [ ] **Step 5:** commit `feat(db): notifications, expiry, email queue`。

---

### Task 7: 寄信 Edge Function

**Files:**
- Create: `supabase/functions/notify-email/email.ts`, `supabase/functions/notify-email/email.test.ts`, `supabase/functions/notify-email/index.ts`

**Interfaces:**
- Produces:
  - `email.ts`（不可使用 Deno API，Vitest 才能測試）：
    `export type EmailInput = { type: 'booking_requested'|'booking_confirmed'|'booking_rejected'|'booking_cancelled'|'booking_expired'; recipientName: string; undergradName: string; date: string /*YYYY-MM-DD*/; period: number; startTime: string /*HH:MM*/; endTime: string; note: string; reason: string | null; appUrl: string }`
    `export function buildEmail(i: EmailInput): { subject: string; text: string }`
  - `index.ts`：接收 `{notification_id}`，用 service role 讀 notification、booking、profiles、periods，呼叫 `buildEmail` 後經 denomailer 寄出（`smtp.gmail.com:465` TLS，帳號 `GMAIL_USER`、密碼 `GMAIL_APP_PASSWORD`），成功後寫入 `emailed_at`；`emailed_at` 已經有值就直接回 200，避免重寄。secrets：`GMAIL_USER`、`GMAIL_APP_PASSWORD`、`APP_URL`。

- [ ] **Step 1: 寫失敗測試** `email.test.ts`：
  - `requested subject`：type `booking_requested`、undergradName '王小美'、date '2026-03-09'、period 3 → `subject === '【研究室】王小美 預約 3/9（一）第3節，待你確認'`；`text` 包含 `'10:10–11:00'`、note、appUrl。
  - `weekday label`：date '2026-03-13' → subject 含 `'3/13（五）'`。
  - `rejected includes reason`：type `booking_rejected`、reason '那天要考試' → `text` 包含 `'原因：那天要考試'`；reason 為 null 時不含 `'原因：'`。
  - 其他三種類型的 subject 分別以 `'【研究室】預約已成立'`、`'【研究室】預約已取消'`、`'【研究室】預約已逾期'` 開頭。
- [ ] **Step 2:** `npm test -- --run supabase/functions`，預期 FAIL。
- [ ] **Step 3:** 實作 `email.ts`、`index.ts`。
- [ ] **Step 4:** `npm test -- --run supabase/functions` 預期 PASS；`npx supabase functions serve notify-email` 啟動時沒有錯誤。
- [ ] **Step 5:** commit `feat(fn): notify-email`。

---

### Task 8: 前端基礎（登入、身分導向、API、通知鈴鐺）

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/database.types.ts`（`npm run gen:types` 產生）, `src/lib/api.ts`, `src/lib/errors.ts`, `src/lib/errors.test.ts`, `src/lib/routes.ts`, `src/lib/routes.test.ts`, `src/auth/AuthProvider.tsx`, `src/hooks/useTableChanges.ts`, `src/components/Layout.tsx`, `src/components/NotificationBell.tsx`, `src/pages/LoginPage.tsx`, `src/pages/PendingPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces:
  - `supabase`（typed client，讀 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`）。
  - `type Profile = Database['public']['Tables']['profiles']['Row']`；`type AffectedBooking = { id: string; date: string; period: number; undergrad_name: string; status: 'pending'|'confirmed' }`；`type ChangeResult = { applied: boolean; affected: AffectedBooking[] }`。
  - `api.ts`：每個 RPC 一個 camelCase 函式：`setWeeklySlot(weekday, period, on, confirm)`、`addException(date, period|null, confirm)`、`removeException(date, period|null)`、`addNoClassDay(date, note, confirm)`、`removeNoClassDay(date)`、`setMentor(undergrad, grad, confirm)`、`setAccountStatus(user, status, confirm)`、`approveUser(user, role, mentor?)`、`setAdmin(user, isAdmin)`、`availableSlots()`、`createBooking(date, period, note)`、`respondBooking(id, accept, reason?)`、`cancelBooking(id, reason?)`、`roster(from, to)`、`uncoveredDays(from, to)`、`markNotificationsRead(ids?)`。錯誤一律 throw `AppError { code: string; message: string }`（message 來自 `rpcErrorMessage`）。
  - `errors.ts`：`rpcErrorMessage(code: string): string`。對照：`TOO_SOON`→'需至少提前 7 天預約'、`SLOT_UNAVAILABLE`→'這個時段已被預約或不再開放，請重新選擇'、`HAS_ACTIVE_BOOKING`→'你已經有一筆進行中的預約'、`NO_MENTOR`→'尚未設定指導研究生，請聯絡管理者'、`NOT_ADMIN`→'需要管理者權限'、`INVALID_MENTOR`→'指導研究生必須是已啟用的研究生'、`LAST_ADMIN`→'至少要保留一位管理者'、`NOT_CANCELLABLE`→'這筆預約已無法取消'、其他→'發生錯誤，請稍後再試'。
  - `routes.ts`：`type RouteKey = 'my-grid'|'master'|'calendar'|'booking'|'requests'|'admin'`；`routesFor(p: Profile | null): RouteKey[]`；`homeFor(p: Profile | null): string`（null→'/login'、非 active→'/pending'，其他→`'/' + routesFor(p)[0]`）。
  - `useAuth(): { session: Session|null; profile: Profile|null; loading: boolean; refresh(): Promise<void> }`。
  - `useTableChanges(tables: string[], onChange: () => void): void`：訂閱 `postgres_changes`（event `*`），unmount 時移除 channel。
- [ ] **Step 1: 寫失敗測試**：
  - `routes.test.ts`：teacher（is_admin）→ `['calendar','my-grid','master','requests','admin']`；grad → `['calendar','my-grid','master','requests']`；undergrad → `['booking','calendar']`；`homeFor({status:'pending',…})` = '/pending'；`homeFor(null)` = '/login'。
  - `errors.test.ts`：上列每個代碼對應的中文，未知代碼回傳預設訊息。
- [ ] **Step 2:** `npm test -- --run src/lib`，預期 FAIL。
- [ ] **Step 3:** 實作以上檔案：
  - LoginPage：只有一顆「使用 Google 帳號登入」按鈕（`signInWithOAuth({provider:'google'})`）。
  - PendingPage：依狀態顯示「帳號審核中，請等候管理者核准」或「帳號已停用」，附登出按鈕。
  - Layout：依 `routesFor` 產生導覽列，手機版收成底部列；右上角放 NotificationBell，顯示未讀數和下拉清單，點開時呼叫 `markNotificationsRead()`，並訂閱 `notifications` 表。
- [ ] **Step 4:** `npm test -- --run` 與 `npx tsc --noEmit` 皆 PASS；`npm run dev` 後能用 Google 登入，新帳號看到審核中頁面（用本機 Supabase 加 Google OAuth 測試憑證手動確認）。
- [ ] **Step 5:** commit `feat(web): auth, routing, api, notifications`。

---

### Task 9: 格子元件與「我的格子」頁（研究生值班／老師可約時段）

**Files:**
- Create: `src/components/WeekGrid.tsx`, `src/components/WeekGrid.test.tsx`, `src/components/ImpactDialog.tsx`, `src/lib/changes.ts`, `src/lib/changes.test.ts`, `src/lib/grid.ts`（本 task 只放常數與 key 函式）, `src/pages/MyGridPage.tsx`

**Interfaces:**
- Consumes: `api.setWeeklySlot`、`ChangeResult`、`AffectedBooking`、`useTableChanges`。
- Produces:
  - `grid.ts`：`WEEKDAYS = [1,2,3,4,5] as const`、`PERIODS = [1,2,3,4,5,6,7,8] as const`、`WEEKDAY_LABELS = ['一','二','三','四','五']`、`slotKey(weekday: number, period: number): string`（格式 `'1-3'`）。
  - `WeekGrid({ cells: (weekday: number, period: number) => ReactNode; onToggle?: (weekday: number, period: number) => void; isOn?: (weekday: number, period: number) => boolean; highlightWeekdays?: number[]; periodTimes?: Record<number,{start:string;end:string}> })`：8 列 × 5 欄的表格，第一欄顯示「第N節」與時間；`highlightWeekdays` 裡的欄加紅底，格子帶 `data-uncovered="true"`。
  - `changes.ts`：`runWithImpact(call: (confirm: boolean) => Promise<ChangeResult>, ask: (affected: AffectedBooking[]) => Promise<boolean>): Promise<ChangeResult | null>`：先 `call(false)`；`applied` 就直接回傳；否則呼叫 `ask`，同意就回傳 `call(true)`，不同意回傳 null。
  - `ImpactDialog({ affected: AffectedBooking[]; onConfirm(): void; onCancel(): void })`：標題「這個變更會取消以下會議」，每列顯示「3/9（一）第3節　王小美（已成立）」，按鈕「確定變更並取消會議」與「先不要」。
- [ ] **Step 1: 寫失敗測試**：
  - `changes.test.ts`：`applied=true` 時 `ask` 不被呼叫、`call` 只被呼叫一次；`applied=false` 且 ask 回 true 時，`call` 依序以 false、true 被呼叫；ask 回 false 時回傳 null，`call` 只被呼叫一次。
  - `WeekGrid.test.tsx`：渲染出 40 個格子；點擊週三第 5 節 → `onToggle(3,5)`；`highlightWeekdays=[4]` 時週四欄的格子帶有 `data-uncovered="true"`。
- [ ] **Step 2:** `npm test -- --run`，預期 FAIL。
- [ ] **Step 3:** 實作。MyGridPage：標題依角色顯示「我的值班時段」（grad）或「我的可約時段」（teacher）；讀取自己在目前學期的 `weekly_slots`；點格子時執行 `runWithImpact(c => setWeeklySlot(w,p,!on,c), 開 ImpactDialog 詢問)`；訂閱 `weekly_slots` 變更後重新讀取。沒有目前學期時顯示「管理者尚未設定學期」。
- [ ] **Step 4:** `npm test -- --run` PASS；手動：兩個瀏覽器分別登入，A 勾選後 B 的頁面不用重新整理就會更新。
- [ ] **Step 5:** commit `feat(web): week grid and my grid page`。

---

### Task 10: 總表

**Files:**
- Create: `src/pages/MasterPage.tsx`, `src/lib/grid.test.ts`
- Modify: `src/lib/grid.ts`

**Interfaces:**
- Consumes: `WeekGrid`、`slotKey`、`useTableChanges`。
- Produces:
  - `buildMasterGrid(slots: {user_id: string; weekday: number; period: number}[], names: Map<string,string>): Map<string, string[]>`：key 為 `slotKey`，value 為依姓名排序的名單；只包含 `names` 裡有的人（呼叫端只傳 active 研究生）。
  - `uncoveredWeekdays(slots: {user_id: string; weekday: number}[], gradIds: Set<string>): number[]`：週一～五中，沒有任何 `gradIds` 成員有格子的星期。
- [ ] **Step 1: 寫失敗測試** `grid.test.ts`：A 有 (1,3)；B 有 (1,3)、(2,5)；老師 T 有 (4,1)；names 只含 A（'阿文'）、B（'小華'）→ `'1-3'` = `['小華','阿文']`（以 `localeCompare(…, 'zh-Hant')` 排序），沒有 `'4-1'`；`uncoveredWeekdays(…, {A,B})` = `[3,4,5]`。
- [ ] **Step 2:** `npm test -- --run src/lib/grid.test.ts`，預期 FAIL。
- [ ] **Step 3:** 實作。MasterPage：讀取目前學期的 `weekly_slots` 與 active 研究生；格子內顯示名字，手機寬度下改顯示人數，點格子展開名單；`highlightWeekdays = uncoveredWeekdays(...)`，上方顯示「週X 整天沒有人」的提示；訂閱 `weekly_slots`、`profiles`。
- [ ] **Step 4:** `npm test -- --run` PASS。
- [ ] **Step 5:** commit `feat(web): master table`。

---

### Task 11: 行事曆

**Files:**
- Create: `src/pages/CalendarPage.tsx`, `src/lib/calendar.ts`, `src/lib/calendar.test.ts`

**Interfaces:**
- Consumes: `api.roster`、`api.uncoveredDays`、`api.addException`、`api.removeException`、`runWithImpact`、`ImpactDialog`、`useTableChanges`。
- Produces:
  - `toEvents(input: { roster: {date:string;user_id:string;period:number}[]; names: Map<string,string>; bookings: {id:string;date:string;period:number;status:string;undergrad_name:string}[]; periodTimes: Record<number,{start:string;end:string}>; uncovered: string[]; noClassDays: {date:string;note:string}[] }): EventInput[]`（FullCalendar 型別）：
    - 每位研究生每天一個全天事件，標題如 `'阿文 3-4節'`（連續節次用 `-` 合併，不連續用 `,` 分隔，例如 `'1,3-4節'`）；
    - 每筆預約一個有時間的事件，標題 `'會議：王小美'`，pending 再加 `'（待確認）'`；
    - `uncovered` 的每一天一個 background 事件，`className: 'uncovered'`（紅底）；
    - 停課日一個 background 事件，標題為 note，`className: 'no-class'`。
- [ ] **Step 1: 寫失敗測試** `calendar.test.ts`：阿文在 3/2 有第 1、3、4 節 → 事件標題 `'阿文 1,3-4節'`、`allDay: true`；pending 預約 3/9 第 3 節 → `start: '2026-03-09T10:10'`、`end: '2026-03-09T11:00'`、標題 `'會議：王小美（待確認）'`；uncovered `['2026-03-03']` → 一個 `display: 'background'`、`className` 含 `'uncovered'` 的事件。
- [ ] **Step 2:** `npm test -- --run src/lib/calendar.test.ts`，預期 FAIL。
- [ ] **Step 3:** 實作。CalendarPage：
  - FullCalendar 可切換 `dayGridMonth`／`timeGridWeek`，`locale` 用 `@fullcalendar/core/locales/zh-tw`，隱藏週末。
  - `datesSet` 時依顯示範圍呼叫 `roster`、`uncoveredDays`，並讀取 bookings（join `profiles` 取專題生姓名，可見範圍由 RLS 過濾）和 no_class_days。
  - 研究生或老師點某一天時開對話框，可選「這天我不在：整天／第 N 節」或「取消請假」，經 `runWithImpact` 呼叫 `addException`／`removeException`。
  - 訂閱 `weekly_slots`、`slot_exceptions`、`bookings`、`no_class_days`。
- [ ] **Step 4:** `npm test -- --run` PASS；手動在手機寬度確認週檢視可用。
- [ ] **Step 5:** commit `feat(web): calendar`。

---

### Task 12: 預約頁（專題生）與待確認頁（老師／研究生）

**Files:**
- Create: `src/pages/BookingPage.tsx`, `src/pages/RequestsPage.tsx`, `src/lib/booking.ts`, `src/lib/booking.test.ts`

**Interfaces:**
- Consumes: `api.availableSlots`、`api.createBooking`、`api.respondBooking`、`api.cancelBooking`、`AppError`、`WeekGrid`、`slotKey`、`useTableChanges`。
- Produces:
  - `groupSlotsByWeek(slots: {date:string;period:number}[]): { weekStart: string; cells: Set<string> }[]`：依週一日期分組，cells 存 `slotKey(isodow, period)`，依週次遞增排序。
  - `activeBooking<B extends {date:string;period:number;status:string}>(bookings: B[], now: Date, periodEnd: Record<number,string>): B | null`：回傳 pending／confirmed 而且尚未結束的那一筆（規則與 SQL `booking_is_upcoming` 相同，只用於顯示）。
- [ ] **Step 1: 寫失敗測試** `booking.test.ts`：slots `[('2026-03-09',3),('2026-03-11',5),('2026-03-16',3)]` → 兩組，第一組 weekStart `'2026-03-09'`、cells `{'1-3','3-5'}`；`activeBooking` 在 now=2026-03-02 時，對「2026-02-23 第 3 節 confirmed」回傳 null，對「2026-03-09 第 3 節 pending」回傳該筆。
- [ ] **Step 2:** `npm test -- --run src/lib/booking.test.ts`，預期 FAIL。
- [ ] **Step 3:** 實作：
  - BookingPage：有進行中的預約時，只顯示該筆的狀態卡（日期節次、老師 ✓／⏳、研究生 ✓／⏳、說明、取消按鈕）。沒有時顯示週切換加 `WeekGrid`，可約的格子標 ○ 而且可以點；點選後開對話框填說明，再呼叫 `createBooking`。錯誤顯示 `AppError.message`，遇到 `SLOT_UNAVAILABLE` 時重新讀取可約時段。下方列出歷史預約，已拒絕的附原因。
  - RequestsPage：「待我確認」清單（自己的 `*_ok` 還是 false 的 pending）有「同意」和「拒絕（附原因）」；「即將到來的會議」清單有「取消（附原因）」。
  - 兩頁都訂閱 `bookings`。
- [ ] **Step 4:** `npm test -- --run` PASS；手動跑一次完整流程：專題生預約、老師同意、研究生同意，三方行事曆都出現會議，通知鈴鐺有新通知。
- [ ] **Step 5:** commit `feat(web): booking and requests pages`。

---

### Task 13: 管理頁、交接文件與部署

**Files:**
- Create: `src/pages/AdminPage.tsx`, `src/pages/AdminPage.test.tsx`, `docs/HANDOVER.md`, `public/_redirects`
- Modify: `.env.example`, `README.md`

**Interfaces:**
- Consumes: `api.approveUser`、`api.setMentor`、`api.setAccountStatus`、`api.setAdmin`、`api.addNoClassDay`、`api.removeNoClassDay`、`runWithImpact`、`ImpactDialog`。
- [ ] **Step 1: 寫失敗測試** `AdminPage.test.tsx`（mock `api`）：待審核使用者選「專題生」時出現「指導研究生」下拉選單，沒選就按「核准」會顯示「請選擇指導研究生」而且不呼叫 `approveUser`；選「研究生」時不出現下拉選單，按「核准」呼叫 `approveUser(id,'grad',undefined)`。
- [ ] **Step 2:** `npm test -- --run src/pages/AdminPage.test.tsx`，預期 FAIL。
- [ ] **Step 3:** 實作 AdminPage 的四個分頁：
  - 「成員」：待審核清單（指定角色、專題生指定指導研究生、核准）；成員清單（更換指導研究生、停用／啟用、設為管理者）。會影響預約的操作都經過 `runWithImpact`。
  - 「學期」：新增學期、設為目前學期（直接寫入 `semesters`，RLS 限管理者）。
  - 「節次時間」：編輯 8 節的起訖時間。
  - 「停課日」：新增（經 `runWithImpact`）與刪除。
- [ ] **Step 4:** 撰寫 `docs/HANDOVER.md`，內容包括：
  - 建立研究室共用 Google 帳號，用它註冊 Supabase、Cloudflare、Google Cloud OAuth，並開啟兩步驟驗證、產生 Gmail 應用程式密碼；
  - 建立 Supabase 專案、`supabase link`、`supabase db push`；
  - 在 vault 設定 `edge_base_url`、`service_role_key`；
  - `supabase secrets set GMAIL_USER=… GMAIL_APP_PASSWORD=… APP_URL=…`、`supabase functions deploy notify-email`；
  - 設定 Google OAuth 的 redirect URL；
  - Cloudflare Pages 部署：build 指令 `npm run build`、輸出目錄 `dist`、環境變數 `VITE_SUPABASE_URL`／`VITE_SUPABASE_ANON_KEY`，`public/_redirects` 內容為 `/* /index.html 200`；
  - 老師第一次登入後，在 SQL Editor 執行 `select bootstrap_admin('老師的email')`；
  - 每學期開學：新增學期、設為目前學期、提醒大家重填格子；
  - 寒暑假後 Supabase 專案被暫停時，到 Dashboard 按 Restore；
  - 更換 Gmail 應用程式密碼的方法。
- [ ] **Step 5:** 執行 `npm test -- --run`、`npx supabase test db`、`npx tsc --noEmit`、`npm run build`，預期全部成功。
- [ ] **Step 6:** commit `feat(web): admin page, handover docs, deploy config`。
