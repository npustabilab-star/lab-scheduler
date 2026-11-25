-- Make the older change RPCs aware of single-day 'extra' slots, and don't write redundant rows.
-- create or replace keeps the existing grants.

create or replace function set_weekly_slot(p_weekday smallint, p_period smallint, p_on boolean, p_confirm boolean default false)
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
    -- single-day extras for this weekday+period are now redundant
    delete from slot_exceptions
     where user_id = auth.uid() and kind = 'extra' and period = p_period
       and extract(isodow from date) = p_weekday
       and date between v_sem.start_date and v_sem.end_date;
    return jsonb_build_object('applied', true, 'affected', '[]'::jsonb);
  end if;

  -- cells that an 'extra' keeps available stay valid after the template slot goes away
  select coalesce(array_agg(b.id), '{}') into v_ids
  from bookings b
  where b.status in ('pending','confirmed') and booking_is_upcoming(b)
    and auth.uid() in (b.teacher_id, b.grad_id)
    and extract(isodow from b.date) = p_weekday and b.period = p_period
    and b.date between v_sem.start_date and v_sem.end_date
    and not exists (select 1 from slot_exceptions e
                    where e.user_id = auth.uid() and e.date = b.date
                      and e.period = b.period and e.kind = 'extra');
  v_list := change_affected_json(v_ids);
  if cardinality(v_ids) > 0 and not p_confirm then
    return jsonb_build_object('applied', false, 'affected', v_list);
  end if;

  delete from weekly_slots
   where user_id = auth.uid() and semester_id = v_sem.id and weekday = p_weekday and period = p_period;
  perform cancel_bookings_internal(v_ids, '時段異動：參與者該時段不在');
  return jsonb_build_object('applied', true, 'affected', v_list);
end $$;

create or replace function add_exception(p_date date, p_period smallint, p_confirm boolean default false)
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

  -- an existing 'extra' for the same cell becomes an 'off'
  insert into slot_exceptions (user_id, date, period, kind) values (auth.uid(), p_date, p_period, 'off')
  on conflict (user_id, date, period) do update set kind = 'off';
  perform cancel_bookings_internal(v_ids, '時段異動：參與者該時段不在');
  return jsonb_build_object('applied', true, 'affected', v_list);
end $$;

create or replace function remove_exception(p_date date, p_period smallint) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_teacher_or_grad() then raise exception 'NOT_ALLOWED'; end if;
  delete from slot_exceptions
   where user_id = auth.uid() and date = p_date and period is not distinct from p_period
     and kind = 'off';
end $$;

-- set_day_slot(false): do not insert a redundant per-period 'off' when the cell is already absent
create or replace function set_day_slot(p_date date, p_period smallint, p_on boolean, p_confirm boolean default false)
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
      delete from slot_exceptions
       where user_id = auth.uid() and date = p_date and period is null;
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
    if v_now then
      insert into slot_exceptions (user_id, date, period, kind)
      values (auth.uid(), p_date, p_period, 'off')
      on conflict (user_id, date, period) do update set kind = 'off';
    end if;
  else
    delete from slot_exceptions
     where user_id = auth.uid() and date = p_date and period = p_period and kind = 'extra';
  end if;
  perform cancel_bookings_internal(v_ids, '時段異動：參與者該時段不在');
  return jsonb_build_object('applied', true, 'affected', v_list);
end $$;

-- Ordering by start_time, not period number (period 8 = lunch sits between 4 and 5).
create or replace function change_affected_json(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id,
           'date', to_char(b.date, 'YYYY-MM-DD'),
           'period', b.period,
           'undergrad_name', p.display_name,
           'status', b.status) order by b.date, per.start_time), '[]'::jsonb)
  from bookings b
  join profiles p on p.id = b.undergrad_id
  join periods per on per.period = b.period
  where b.id = any(p_ids)
$$;

create or replace function available_slots() returns table(date date, period smallint)
language sql stable security definer set search_path = public
as $$
  select d::date, per.period
  from profiles me
  join profiles m on m.id = me.mentor_id and m.status = 'active'
  cross join lateral current_semester() s
  cross join lateral generate_series(greatest(taipei_today() + 7, s.start_date), s.end_date, interval '1 day') d
  cross join periods per
  where me.id = auth.uid() and me.role = 'undergrad' and me.status = 'active'
    and is_present(the_teacher(), d::date, per.period)
    and is_present(m.id, d::date, per.period)
    and not exists (select 1 from bookings b
                    where b.date = d::date and b.period = per.period
                      and b.status in ('pending','confirmed'))
  order by 1, per.start_time
$$;
