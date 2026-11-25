-- School day has 7 periods (lunch 12:00-13:20 is display-only, not a period row).

-- period 8 goes away: cancel live bookings, then drop dependent rows
select cancel_bookings_internal(coalesce(array_agg(id), '{}'), '節次調整')
  from bookings where period = 8 and status in ('pending','confirmed');
-- remaining period-8 bookings are history (cancelled/rejected/expired); the FK to periods has no cascade
delete from bookings where period = 8;
delete from weekly_slots where period = 8;
delete from slot_exceptions where period = 8;

update periods set start_time = '08:10', end_time = '09:00' where period = 1;
update periods set start_time = '09:10', end_time = '10:00' where period = 2;
update periods set start_time = '10:15', end_time = '11:05' where period = 3;
update periods set start_time = '11:10', end_time = '12:00' where period = 4;
update periods set start_time = '13:30', end_time = '14:20' where period = 5;
update periods set start_time = '14:30', end_time = '15:20' where period = 6;
update periods set start_time = '15:30', end_time = '16:20' where period = 7;
delete from periods where period = 8;

alter table periods drop constraint periods_period_check;
alter table periods add constraint periods_period_check check (period between 1 and 7);
alter table weekly_slots drop constraint weekly_slots_period_check;
alter table weekly_slots add constraint weekly_slots_period_check check (period between 1 and 7);
alter table slot_exceptions drop constraint slot_exceptions_period_check;
alter table slot_exceptions add constraint slot_exceptions_period_check check (period between 1 and 7);

-- same body as 20261125000012, bound 8 -> 7 (create or replace keeps grants)
create or replace function day_slot_check(p_date date, p_period smallint) returns semesters
language plpgsql stable security definer set search_path = public
as $$
declare v_sem semesters;
begin
  if not is_teacher_or_grad() then raise exception 'NOT_ALLOWED'; end if;
  if p_date is null or p_period is null or p_period not between 1 and 7 then
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
