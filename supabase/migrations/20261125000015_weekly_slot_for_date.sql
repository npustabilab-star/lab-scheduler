-- set_weekly_slot gains an optional p_date: the date being viewed in the weekly grid.
-- After the template change the caller's per-period exception for (p_date, p_period) is dropped,
-- so that week follows the template instead of keeping a stale 'off' / 'extra'.

drop function set_weekly_slot(smallint, smallint, boolean, boolean);

create function set_weekly_slot(
  p_weekday smallint, p_period smallint, p_on boolean, p_confirm boolean default false,
  p_date date default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sem semesters;
  v_ids uuid[];
  v_list jsonb;
begin
  if not is_teacher_or_grad() then raise exception 'NOT_ALLOWED'; end if;
  if p_date is not null then
    v_sem := day_slot_check(p_date, p_period);
    if extract(isodow from p_date) <> p_weekday then raise exception 'NOT_EDITABLE'; end if;
  else
    select * into v_sem from current_semester();
    if v_sem.id is null then raise exception 'NO_SEMESTER'; end if;
  end if;

  if p_on then
    insert into weekly_slots (user_id, semester_id, weekday, period)
    values (auth.uid(), v_sem.id, p_weekday, p_period)
    on conflict do nothing;
    -- single-day extras for this weekday+period are now redundant
    delete from slot_exceptions
     where user_id = auth.uid() and kind = 'extra' and period = p_period
       and extract(isodow from date) = p_weekday
       and date between v_sem.start_date and v_sem.end_date;
    -- the viewed week follows the template (drops a stale 'off')
    if p_date is not null then
      delete from slot_exceptions
       where user_id = auth.uid() and date = p_date and period = p_period;
    end if;
    return jsonb_build_object('applied', true, 'affected', '[]'::jsonb);
  end if;

  -- cells that an 'extra' keeps available stay valid after the template slot goes away,
  -- except the viewed date, whose exception is dropped below
  select coalesce(array_agg(b.id), '{}') into v_ids
  from bookings b
  where b.status in ('pending','confirmed') and booking_is_upcoming(b)
    and auth.uid() in (b.teacher_id, b.grad_id)
    and extract(isodow from b.date) = p_weekday and b.period = p_period
    and b.date between v_sem.start_date and v_sem.end_date
    and (b.date is not distinct from p_date
         or not exists (select 1 from slot_exceptions e
                        where e.user_id = auth.uid() and e.date = b.date
                          and e.period = b.period and e.kind = 'extra'));
  v_list := change_affected_json(v_ids);
  if cardinality(v_ids) > 0 and not p_confirm then
    return jsonb_build_object('applied', false, 'affected', v_list);
  end if;

  delete from weekly_slots
   where user_id = auth.uid() and semester_id = v_sem.id and weekday = p_weekday and period = p_period;
  if p_date is not null then
    delete from slot_exceptions
     where user_id = auth.uid() and date = p_date and period = p_period;
  end if;
  perform cancel_bookings_internal(v_ids, '時段異動：參與者該時段不在');
  return jsonb_build_object('applied', true, 'affected', v_list);
end $$;

revoke execute on function set_weekly_slot(smallint, smallint, boolean, boolean, date) from public, anon;
grant execute on function set_weekly_slot(smallint, smallint, boolean, boolean, date) to authenticated, service_role;
