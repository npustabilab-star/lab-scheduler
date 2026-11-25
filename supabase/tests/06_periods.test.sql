begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select throws_ok(
  $$update periods set end_time = start_time where period = 1$$,
  '23514', null, 'end_time equal to start_time is rejected');
select throws_ok(
  $$update periods set end_time = '07:00' where period = 1$$,
  '23514', null, 'end_time before start_time is rejected');
select is((select count(*)::int from periods where end_time > start_time), 7,
  'all 7 default periods satisfy the constraint');
select is((select count(*)::int from periods), 7, 'periods has exactly 7 rows');
select is((select string_agg(period || ' ' || to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI'), ', ' order by period) from periods),
  '1 08:10-09:00, 2 09:10-10:00, 3 10:15-11:05, 4 11:10-12:00, 5 13:30-14:20, 6 14:30-15:20, 7 15:30-16:20',
  'period times match the school schedule');
select tests.create_user('g@x.com', 'grad') as g \gset
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);
select throws_ok(
  format($$insert into weekly_slots (user_id, semester_id, weekday, period)
           select %L, id, 1, 8 from semesters$$, :'g'),
  '23514', null, 'weekly_slot with period 8 is rejected');
select throws_ok(
  format($$insert into slot_exceptions (user_id, date, period) values (%L, '2026-03-09', 8)$$, :'g'),
  '23514', null, 'slot_exception with period 8 is rejected');

select * from finish();
rollback;
