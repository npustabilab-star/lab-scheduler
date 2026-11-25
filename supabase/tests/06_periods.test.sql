begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select throws_ok(
  $$update periods set end_time = start_time where period = 1$$,
  '23514', null, 'end_time equal to start_time is rejected');
select throws_ok(
  $$update periods set end_time = '07:00' where period = 1$$,
  '23514', null, 'end_time before start_time is rejected');
select is((select count(*)::int from periods where end_time > start_time), 8,
  'all 8 default periods satisfy the constraint');
select is((select count(*)::int from periods), 8, 'periods has exactly 8 rows');
select is((select string_agg(period || ' ' || label || ' ' || to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI'), ', ' order by period) from periods),
  '1 第1節 08:10-09:00, 2 第2節 09:10-10:00, 3 第3節 10:15-11:05, 4 第4節 11:10-12:00, 5 第5節 13:30-14:20, 6 第6節 14:30-15:20, 7 第7節 15:30-16:20, 8 午休 13:00-13:20',
  'period times and labels match the school schedule');
select is((select string_agg(period::text, ',' order by start_time) from periods), '1,2,3,4,8,5,6,7',
  'start_time order puts lunch (8) between 4 and 5');
select throws_ok(
  $$insert into periods (period, start_time, end_time, label) values (9, '17:00', '17:50', 'x')$$,
  '23514', null, 'period 9 is rejected');

select * from finish();
rollback;
