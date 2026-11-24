-- Schema: enums, base tables, time helpers. 時區固定 Asia/Taipei.

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
insert into periods (period, start_time, end_time) values
  (1, '08:10', '09:00'), (2, '09:10', '10:00'), (3, '10:10', '11:00'), (4, '11:10', '12:00'),
  (5, '13:10', '14:00'), (6, '14:10', '15:00'), (7, '15:10', '16:00'), (8, '16:10', '17:00');
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

-- 「現在／今天」唯一來源；測試以 set local app.now = '...' 覆寫
create function taipei_now() returns timestamp
language sql stable
as $$ select coalesce(nullif(current_setting('app.now', true), '')::timestamp,
                      now() at time zone 'Asia/Taipei') $$;

create function taipei_today() returns date
language sql stable
as $$ select taipei_now()::date $$;
