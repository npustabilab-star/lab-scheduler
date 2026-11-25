-- Student-ID login: student_id, notify_email, forced password change.

alter table profiles
  add column student_id text unique,
  add column notify_email text,
  add column must_change_password boolean not null default false;

-- a member who still must change the initial password has no access
create or replace function is_active_member() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles
    where id = auth.uid() and status = 'active' and not must_change_password) $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles
    where id = auth.uid() and status = 'active' and is_admin and not must_change_password) $$;

-- caller clears their own flag (must work before they count as an active member)
create function password_changed() returns void
language plpgsql security definer set search_path = public
as $$
begin
  update profiles set must_change_password = false where id = auth.uid();
end $$;
revoke execute on function password_changed() from public, anon;
grant execute on function password_changed() to authenticated;

-- service-role only: activate a profile created by the admin backend
create function admin_setup_member(
  p_user uuid, p_student_id text, p_display_name text, p_role user_role,
  p_mentor uuid, p_notify_email text, p_is_admin boolean) returns void
language plpgsql security definer set search_path = public
as $$
begin
  p_notify_email := nullif(btrim(coalesce(p_notify_email, '')), '');
  if not exists (select 1 from profiles where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
  if exists (select 1 from profiles where student_id = p_student_id and id <> p_user) then
    raise exception 'STUDENT_ID_EXISTS';
  end if;

  if p_role = 'teacher' then
    if p_notify_email is null then raise exception 'EMAIL_REQUIRED'; end if;
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

  update profiles
     set status = 'active', role = p_role, mentor_id = p_mentor, student_id = p_student_id,
         display_name = p_display_name, notify_email = p_notify_email,
         is_admin = coalesce(p_is_admin, false), must_change_password = true
   where id = p_user;
end $$;

create function admin_reset_flag(p_user uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update profiles set must_change_password = true where id = p_user;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
end $$;

create function set_notify_email(p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = public
as $$
declare v_email text := nullif(btrim(coalesce(p_email, '')), '');
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
  if v_email is null and exists (select 1 from profiles where id = p_user and role = 'teacher') then
    raise exception 'EMAIL_REQUIRED';
  end if;
  update profiles set notify_email = v_email where id = p_user;
end $$;

revoke execute on function admin_setup_member(uuid, text, text, user_role, uuid, text, boolean)
  from public, anon, authenticated;
revoke execute on function admin_reset_flag(uuid) from public, anon, authenticated;
grant execute on function admin_setup_member(uuid, text, text, user_role, uuid, text, boolean) to service_role;
grant execute on function admin_reset_flag(uuid) to service_role;
revoke execute on function set_notify_email(uuid, text) from public, anon;
