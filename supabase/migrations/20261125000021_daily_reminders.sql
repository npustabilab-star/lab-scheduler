-- Daily reminders (08:00 Taipei), shown in the bell and emailed to anyone with a notify_email.
-- 1) booking_reminder: a pending booking expires 3 days before its date (expire_pending_bookings),
--    so one day earlier (date - 4) whoever has not confirmed yet (teacher and/or mentor grad) is reminded.
-- 2) duty_lead_reminder: the day before a date on which some period has 2+ grads present and the
--    teacher has not picked the 主值 for that weekly slot, the teacher is reminded.

alter table notifications alter column booking_id drop not null;
alter table notifications add column ref_date date;      -- duty_lead_reminder: the date concerned
alter table notifications add column detail text;        -- duty_lead_reminder: which periods

create function send_daily_reminders() returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := taipei_today();
  v_tomorrow date := taipei_today() + 1;
  v_teacher uuid := the_teacher();
  v_detail text;
  v_n integer := 0;
  v_c integer;
begin
  -- 1) unconfirmed bookings, one day before they expire
  insert into notifications (user_id, type, booking_id)
  select u.uid, 'booking_reminder', b.id
  from bookings b
  cross join lateral (values (b.teacher_id, b.teacher_ok), (b.grad_id, b.grad_ok)) as u(uid, ok)
  where b.status = 'pending' and b.date - 4 = v_today and not u.ok
    and not exists (select 1 from notifications n
                    where n.user_id = u.uid and n.booking_id = b.id and n.type = 'booking_reminder');
  get diagnostics v_c = row_count;
  v_n := v_n + v_c;

  -- 2) tomorrow's slots with 2+ grads and no 主值
  if v_teacher is not null and extract(isodow from v_tomorrow) between 1 and 5 then
    select string_agg(x.label || '（' || x.names || '）', '、' order by x.start_time) into v_detail
    from (
      select per.label, per.start_time, string_agg(p.display_name, '、' order by p.display_name) as names
      from roster(v_tomorrow, v_tomorrow) r
      join profiles p on p.id = r.user_id
      join periods per on per.period = r.period
      where not exists (select 1 from duty_leads l
                        join semesters s on s.id = l.semester_id
                        where v_tomorrow between s.start_date and s.end_date
                          and l.weekday = extract(isodow from v_tomorrow) and l.period = r.period
                          and exists (select 1 from roster(v_tomorrow, v_tomorrow) r2
                                      where r2.period = r.period and r2.user_id = l.user_id))
      group by per.label, per.start_time
      having count(*) > 1
    ) x;
    if v_detail is not null and not exists (select 1 from notifications n
        where n.user_id = v_teacher and n.type = 'duty_lead_reminder' and n.ref_date = v_tomorrow) then
      insert into notifications (user_id, type, ref_date, detail)
      values (v_teacher, 'duty_lead_reminder', v_tomorrow, v_detail);
      v_n := v_n + 1;
    end if;
  end if;
  return v_n;
end $$;
revoke execute on function send_daily_reminders() from public, anon, authenticated;
grant execute on function send_daily_reminders() to service_role;

-- 00:00 UTC = 08:00 Asia/Taipei
select cron.schedule('daily-reminders', '0 0 * * *', 'select send_daily_reminders()');
