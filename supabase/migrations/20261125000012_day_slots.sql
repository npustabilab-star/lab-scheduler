-- Per-day slot adjustments: slot_exceptions.kind 'off' (not available that day) or 'extra'
-- (available that day although the weekly template lacks it). Whole-day 'off' (period null) wins.

alter table slot_exceptions
  add column kind text not null default 'off' check (kind in ('off', 'extra'));
-- 'extra' always targets one period (whole-day extra makes no sense)
alter table slot_exceptions
  add constraint slot_exceptions_extra_needs_period check (kind = 'off' or period is not null);
-- The existing unique (user_id, date, period) nulls-not-distinct constraint already allows only one
-- row per cell regardless of kind, so an 'off' and an 'extra' for the same cell cannot coexist.

create or replace function is_present(p_user uuid, p_date date, p_period smallint) returns boolean
language sql stable security definer set search_path = public
as $$
  select (auth.uid() is null or is_active_member())
    and exists (
      select 1
      from profiles p
      join semesters s on p_date between s.start_date and s.end_date
      where p.id = p_user and p.status = 'active'
        and extract(isodow from p_date) between 1 and 5
        and not exists (select 1 from no_class_days n where n.date = p_date)
        -- whole-day off beats everything
        and not exists (select 1 from slot_exceptions e
                        where e.user_id = p_user and e.date = p_date and e.period is null)
        and (
          (exists (select 1 from weekly_slots w
                   where w.user_id = p_user and w.semester_id = s.id
                     and w.weekday = extract(isodow from p_date) and w.period = p_period)
           and not exists (select 1 from slot_exceptions e
                           where e.user_id = p_user and e.date = p_date and e.period = p_period
                             and e.kind = 'off'))
          or exists (select 1 from slot_exceptions e
                     where e.user_id = p_user and e.date = p_date and e.period = p_period
                       and e.kind = 'extra')
        )
    )
$$;

create or replace function roster(p_from date, p_to date)
returns table(date date, user_id uuid, period smallint)
language sql stable security definer set search_path = public
as $$
  select distinct x.dt, x.uid, x.per
  from (
    -- weekly template minus per-period off
    select d::date as dt, w.user_id as uid, w.period as per
    from generate_series(p_from, p_to, interval '1 day') d
    join semesters s on d::date between s.start_date and s.end_date
    join weekly_slots w on w.semester_id = s.id and w.weekday = extract(isodow from d)
    where not exists (select 1 from slot_exceptions e
                      where e.user_id = w.user_id and e.date = d::date
                        and e.period = w.period and e.kind = 'off')
    union all
    -- single-day extras (inside a semester, Mon-Fri)
    select e.date, e.user_id, e.period
    from slot_exceptions e
    where e.kind = 'extra' and e.date between p_from and p_to
      and extract(isodow from e.date) between 1 and 5
      and exists (select 1 from semesters s where e.date between s.start_date and s.end_date)
  ) x
  join profiles p on p.id = x.uid and p.status = 'active' and p.role = 'grad'
  where (auth.uid() is null or is_active_member())
    and not exists (select 1 from no_class_days n where n.date = x.dt)
    and not exists (select 1 from slot_exceptions e
                    where e.user_id = x.uid and e.date = x.dt and e.period is null)
$$;
-- uncovered_days is defined on roster() and needs no change.

-- internal: validates the caller and the cell, returns the current semester.
create function day_slot_check(p_date date, p_period smallint) returns semesters
language plpgsql stable security definer set search_path = public
as $$
declare v_sem semesters;
begin
  if not is_teacher_or_grad() then raise exception 'NOT_ALLOWED'; end if;
  if p_date is null or p_period is null or p_period not between 1 and 8 then
    raise exception 'NOT_EDITABLE';
  end if;
  select * into v_sem from current_semester();
  if v_sem.id is null
     or p_date < taipei_today()
     or p_date not between v_sem.start_date and v_sem.end_date
     or extract(isodow from p_date) not between 1 and 5
     or exists (select 1 from no_class_days n where n.date = p_date) then
    raise exception 'NOT_EDITABLE';
  end if;
  return v_sem;
end $$;
revoke execute on function day_slot_check(date, smallint) from public, anon, authenticated;

create function set_day_slot(p_date date, p_period smallint, p_on boolean, p_confirm boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sem semesters;
  v_tmpl boolean;
  v_whole boolean;
  v_now boolean;
  v_ids uuid[] := '{}';
  v_list jsonb := '[]'::jsonb;
  v_p smallint;
begin
  v_sem := day_slot_check(p_date, p_period);
  v_tmpl := exists (select 1 from weekly_slots w
                    where w.user_id = auth.uid() and w.semester_id = v_sem.id
                      and w.weekday = extract(isodow from p_date) and w.period = p_period);
  v_whole := exists (select 1 from slot_exceptions e
                     where e.user_id = auth.uid() and e.date = p_date and e.period is null);
  v_now := is_present(auth.uid(), p_date, p_period);

  if p_on then
    if v_whole then
      -- turn the whole-day off into per-period offs for the other template periods
      delete from slot_exceptions
       where user_id = auth.uid() and date = p_date and period is null;
      -- extras were suppressed by the whole-day off; keep them suppressed except this cell
      delete from slot_exceptions
       where user_id = auth.uid() and date = p_date and kind = 'extra' and period <> p_period;
      for v_p in
        select w.period from weekly_slots w
        where w.user_id = auth.uid() and w.semester_id = v_sem.id
          and w.weekday = extract(isodow from p_date) and w.period <> p_period
      loop
        insert into slot_exceptions (user_id, date, period, kind)
        values (auth.uid(), p_date, v_p, 'off')
        on conflict (user_id, date, period) do update set kind = 'off';
      end loop;
    end if;
    if v_tmpl then
      delete from slot_exceptions
       where user_id = auth.uid() and date = p_date and period = p_period and kind = 'off';
    else
      insert into slot_exceptions (user_id, date, period, kind)
      values (auth.uid(), p_date, p_period, 'extra')
      on conflict (user_id, date, period) do update set kind = 'extra';
    end if;
    return jsonb_build_object('applied', true, 'affected', v_list);
  end if;

  -- p_on = false
  if v_now then
    select coalesce(array_agg(b.id), '{}') into v_ids
    from bookings b
    where b.status in ('pending','confirmed') and booking_is_upcoming(b)
      and auth.uid() in (b.teacher_id, b.grad_id)
      and b.date = p_date and b.period = p_period;
    v_list := change_affected_json(v_ids);
    if cardinality(v_ids) > 0 and not p_confirm then
      return jsonb_build_object('applied', false, 'affected', v_list);
    end if;
  end if;

  if v_tmpl then
    insert into slot_exceptions (user_id, date, period, kind)
    values (auth.uid(), p_date, p_period, 'off')
    on conflict (user_id, date, period) do update set kind = 'off';
  else
    delete from slot_exceptions
     where user_id = auth.uid() and date = p_date and period = p_period and kind = 'extra';
  end if;
  perform cancel_bookings_internal(v_ids, '時段異動：參與者該時段不在');
  return jsonb_build_object('applied', true, 'affected', v_list);
end $$;

create function clear_day_slot(p_date date, p_period smallint, p_confirm boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sem semesters;
  v_tmpl boolean;
  v_now boolean;
  v_ids uuid[] := '{}';
  v_list jsonb := '[]'::jsonb;
begin
  v_sem := day_slot_check(p_date, p_period);
  v_tmpl := exists (select 1 from weekly_slots w
                    where w.user_id = auth.uid() and w.semester_id = v_sem.id
                      and w.weekday = extract(isodow from p_date) and w.period = p_period);
  v_now := is_present(auth.uid(), p_date, p_period);

  -- present now but the template would not have it (only an extra keeps them present)
  if v_now and not v_tmpl then
    select coalesce(array_agg(b.id), '{}') into v_ids
    from bookings b
    where b.status in ('pending','confirmed') and booking_is_upcoming(b)
      and auth.uid() in (b.teacher_id, b.grad_id)
      and b.date = p_date and b.period = p_period;
    v_list := change_affected_json(v_ids);
    if cardinality(v_ids) > 0 and not p_confirm then
      return jsonb_build_object('applied', false, 'affected', v_list);
    end if;
  end if;

  delete from slot_exceptions
   where user_id = auth.uid() and date = p_date and period = p_period;
  perform cancel_bookings_internal(v_ids, '時段異動：參與者該時段不在');
  return jsonb_build_object('applied', true, 'affected', v_list);
end $$;

-- explicit grants (hosted grants nothing by default)
revoke execute on function set_day_slot(date, smallint, boolean, boolean) from public, anon;
revoke execute on function clear_day_slot(date, smallint, boolean) from public, anon;
grant execute on function
  set_day_slot(date, smallint, boolean, boolean),
  clear_day_slot(date, smallint, boolean)
  to authenticated, service_role;
grant execute on function day_slot_check(date, smallint) to service_role;
-- create or replace keeps the existing grants of is_present / roster
