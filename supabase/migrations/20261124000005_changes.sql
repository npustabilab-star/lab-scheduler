-- Changes that can invalidate bookings: warn first (applied=false + affected list),
-- apply and cancel when p_confirm = true.

-- internal: affected bookings as jsonb array (never null). Call BEFORE cancelling so status is the old one.
create function change_affected_json(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id,
           'date', to_char(b.date, 'YYYY-MM-DD'),
           'period', b.period,
           'undergrad_name', p.display_name,
           'status', b.status) order by b.date, b.period), '[]'::jsonb)
  from bookings b join profiles p on p.id = b.undergrad_id
  where b.id = any(p_ids)
$$;
revoke execute on function change_affected_json(uuid[]) from public, anon, authenticated;

create function is_teacher_or_grad() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles
       where id = auth.uid() and status = 'active' and role in ('teacher','grad')) $$;
revoke execute on function is_teacher_or_grad() from public, anon, authenticated;

create function set_weekly_slot(p_weekday smallint, p_period smallint, p_on boolean, p_confirm boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sem semesters;
  v_ids uuid[];
  v_list jsonb;
begin
  if not is_teacher_or_grad() then raise exception 'NOT_ALLOWED'; end if;
  select * into v_sem from current_semester();
  if v_sem.id is null then raise exception 'NO_SEMESTER'; end if;

  if p_on then
    insert into weekly_slots (user_id, semester_id, weekday, period)
    values (auth.uid(), v_sem.id, p_weekday, p_period)
    on conflict do nothing;
    return jsonb_build_object('applied', true, 'affected', '[]'::jsonb);
  end if;

  select coalesce(array_agg(b.id), '{}') into v_ids
  from bookings b
  where b.status in ('pending','confirmed') and booking_is_upcoming(b)
    and auth.uid() in (b.teacher_id, b.grad_id)
    and extract(isodow from b.date) = p_weekday and b.period = p_period
    and b.date between v_sem.start_date and v_sem.end_date;
  v_list := change_affected_json(v_ids);
  if cardinality(v_ids) > 0 and not p_confirm then
    return jsonb_build_object('applied', false, 'affected', v_list);
  end if;

  delete from weekly_slots
   where user_id = auth.uid() and semester_id = v_sem.id and weekday = p_weekday and period = p_period;
  perform cancel_bookings_internal(v_ids, '時段異動：參與者該時段不在');
  return jsonb_build_object('applied', true, 'affected', v_list);
end $$;

create function add_exception(p_date date, p_period smallint, p_confirm boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ids uuid[];
  v_list jsonb;
begin
  if not is_teacher_or_grad() then raise exception 'NOT_ALLOWED'; end if;

  select coalesce(array_agg(b.id), '{}') into v_ids
  from bookings b
  where b.status in ('pending','confirmed') and booking_is_upcoming(b)
    and auth.uid() in (b.teacher_id, b.grad_id)
    and b.date = p_date and (p_period is null or b.period = p_period);
  v_list := change_affected_json(v_ids);
  if cardinality(v_ids) > 0 and not p_confirm then
    return jsonb_build_object('applied', false, 'affected', v_list);
  end if;

  insert into slot_exceptions (user_id, date, period) values (auth.uid(), p_date, p_period)
  on conflict do nothing;
  perform cancel_bookings_internal(v_ids, '時段異動：參與者該時段不在');
  return jsonb_build_object('applied', true, 'affected', v_list);
end $$;

create function remove_exception(p_date date, p_period smallint) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_teacher_or_grad() then raise exception 'NOT_ALLOWED'; end if;
  delete from slot_exceptions
   where user_id = auth.uid() and date = p_date and period is not distinct from p_period;
end $$;

create function add_no_class_day(p_date date, p_note text, p_confirm boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ids uuid[];
  v_list jsonb;
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;

  select coalesce(array_agg(b.id), '{}') into v_ids
  from bookings b
  where b.status in ('pending','confirmed') and booking_is_upcoming(b) and b.date = p_date;
  v_list := change_affected_json(v_ids);
  if cardinality(v_ids) > 0 and not p_confirm then
    return jsonb_build_object('applied', false, 'affected', v_list);
  end if;

  insert into no_class_days (date, note) values (p_date, coalesce(p_note, ''))
  on conflict (date) do update set note = excluded.note;
  perform cancel_bookings_internal(v_ids, '停課日');
  return jsonb_build_object('applied', true, 'affected', v_list);
end $$;

create function remove_no_class_day(p_date date) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from no_class_days where date = p_date;
end $$;

create function set_mentor(p_undergrad uuid, p_grad uuid, p_confirm boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_old uuid;
  v_ids uuid[];
  v_list jsonb;
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from profiles where id = p_grad and role = 'grad' and status = 'active') then
    raise exception 'INVALID_MENTOR';
  end if;
  select mentor_id into v_old from profiles where id = p_undergrad and role = 'undergrad';
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  if v_old is not distinct from p_grad then
    return jsonb_build_object('applied', true, 'affected', '[]'::jsonb);
  end if;

  select coalesce(array_agg(b.id), '{}') into v_ids
  from bookings b
  where b.status in ('pending','confirmed') and booking_is_upcoming(b) and b.undergrad_id = p_undergrad;
  v_list := change_affected_json(v_ids);
  if cardinality(v_ids) > 0 and not p_confirm then
    return jsonb_build_object('applied', false, 'affected', v_list);
  end if;

  update profiles set mentor_id = p_grad where id = p_undergrad;
  perform cancel_bookings_internal(v_ids, '更換指導研究生');
  return jsonb_build_object('applied', true, 'affected', v_list);
end $$;

create function set_account_status(p_user uuid, p_status account_status, p_confirm boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ids uuid[] := '{}';
  v_list jsonb := '[]'::jsonb;
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
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

revoke execute on function set_weekly_slot(smallint, smallint, boolean, boolean) from public, anon;
revoke execute on function add_exception(date, smallint, boolean) from public, anon;
revoke execute on function remove_exception(date, smallint) from public, anon;
revoke execute on function add_no_class_day(date, text, boolean) from public, anon;
revoke execute on function remove_no_class_day(date) from public, anon;
revoke execute on function set_mentor(uuid, uuid, boolean) from public, anon;
revoke execute on function set_account_status(uuid, account_status, boolean) from public, anon;
