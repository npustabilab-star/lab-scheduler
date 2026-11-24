-- Profiles, access helpers, RLS, admin RPCs.

-- helpers (security definer so RLS on profiles does not recurse)
create function is_active_member() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid() and status = 'active') $$;

create function is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid() and status = 'active' and is_admin) $$;

create function the_teacher() returns uuid
language sql stable security definer set search_path = public
as $$ select id from profiles where role = 'teacher' and status = 'active' limit 1 $$;

create function current_semester() returns semesters
language sql stable security definer set search_path = public
as $$ select s from semesters s where is_current limit 1 $$;

-- new auth user -> pending profile
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)));
  return new;
end $$;
revoke execute on function handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- RLS
alter table profiles enable row level security;
alter table semesters enable row level security;
alter table periods enable row level security;
alter table no_class_days enable row level security;
alter table weekly_slots enable row level security;
alter table slot_exceptions enable row level security;

create policy profiles_select on profiles for select
  using (id = auth.uid() or is_active_member());

create policy semesters_select on semesters for select using (is_active_member());
create policy semesters_admin_ins on semesters for insert with check (is_admin());
create policy semesters_admin_upd on semesters for update using (is_admin()) with check (is_admin());
create policy semesters_admin_del on semesters for delete using (is_admin());

create policy periods_select on periods for select using (is_active_member());
create policy periods_admin_ins on periods for insert with check (is_admin());
create policy periods_admin_upd on periods for update using (is_admin()) with check (is_admin());
create policy periods_admin_del on periods for delete using (is_admin());

create policy no_class_days_select on no_class_days for select using (is_active_member());

create policy weekly_slots_select on weekly_slots for select using (is_active_member());
create policy slot_exceptions_select on slot_exceptions for select using (is_active_member());

-- admin RPCs
create function approve_user(p_user uuid, p_role user_role, p_mentor uuid default null) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;

  if p_role = 'teacher' then
    if exists (select 1 from profiles where role = 'teacher' and status = 'active' and id <> p_user) then
      raise exception 'TEACHER_EXISTS';
    end if;
    p_mentor := null;
  elsif p_role = 'undergrad' then
    if p_mentor is null or not exists (
      select 1 from profiles where id = p_mentor and role = 'grad' and status = 'active') then
      raise exception 'INVALID_MENTOR';
    end if;
  else
    p_mentor := null;
  end if;

  update profiles set status = 'active', role = p_role, mentor_id = p_mentor where id = p_user;
end $$;

create function set_admin(p_user uuid, p_is_admin boolean) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
  if not p_is_admin and not exists (
    select 1 from profiles where is_admin and status = 'active' and id <> p_user) then
    raise exception 'LAST_ADMIN';
  end if;
  update profiles set is_admin = p_is_admin where id = p_user;
end $$;

create function bootstrap_admin(p_email text) returns void
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if exists (select 1 from profiles where is_admin) then raise exception 'ALREADY_BOOTSTRAPPED'; end if;
  select id into v_id from profiles where lower(email) = lower(p_email);
  if v_id is null then raise exception 'USER_NOT_FOUND'; end if;
  update profiles set status = 'active', role = 'teacher', is_admin = true, mentor_id = null where id = v_id;
end $$;

revoke execute on function bootstrap_admin(text) from public, anon, authenticated;
revoke execute on function approve_user(uuid, user_role, uuid) from public, anon;
revoke execute on function set_admin(uuid, boolean) from public, anon;
