-- Only the teacher grants/revokes admin rights, and only the teacher may change the status of
-- the teacher or of another admin. create or replace keeps the existing grants.

create or replace function is_active_teacher() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from profiles
                 where id = auth.uid() and role = 'teacher' and status = 'active'
                   and not must_change_password)
$$;
revoke execute on function is_active_teacher() from public, anon, authenticated;
grant execute on function is_active_teacher() to service_role;

create or replace function set_admin(p_user uuid, p_is_admin boolean) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_active_teacher() then raise exception 'ONLY_TEACHER'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
  if not p_is_admin and not exists (
    select 1 from profiles where is_admin and status = 'active' and id <> p_user) then
    raise exception 'LAST_ADMIN';
  end if;
  update profiles set is_admin = p_is_admin where id = p_user;
end $$;

create or replace function set_account_status(p_user uuid, p_status account_status, p_confirm boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ids uuid[] := '{}';
  v_list jsonb := '[]'::jsonb;
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
  if not is_active_teacher()
     and exists (select 1 from profiles where id = p_user and (role = 'teacher' or is_admin)) then
    raise exception 'ONLY_TEACHER';
  end if;
  if p_status <> 'active' and not exists (
    select 1 from profiles where is_admin and status = 'active' and id <> p_user)
    and exists (select 1 from profiles where id = p_user and is_admin and status = 'active') then
    raise exception 'LAST_ADMIN';
  end if;

  if p_status = 'disabled' then
    select coalesce(array_agg(b.id), '{}') into v_ids
    from bookings b
    where b.status in ('pending','confirmed') and booking_is_upcoming(b)
      and p_user in (b.undergrad_id, b.teacher_id, b.grad_id);
    v_list := change_affected_json(v_ids);
    if cardinality(v_ids) > 0 and not p_confirm then
      return jsonb_build_object('applied', false, 'affected', v_list);
    end if;
  end if;

  update profiles set status = p_status where id = p_user;
  if p_status = 'disabled' then
    perform cancel_bookings_internal(v_ids, '帳號停用');
  end if;
  return jsonb_build_object('applied', true, 'affected', v_list);
end $$;
