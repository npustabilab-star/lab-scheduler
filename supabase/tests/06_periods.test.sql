begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select throws_ok(
  $$update periods set end_time = start_time where period = 1$$,
  '23514', null, 'end_time equal to start_time is rejected');
select throws_ok(
  $$update periods set end_time = '07:00' where period = 1$$,
  '23514', null, 'end_time before start_time is rejected');
select is((select count(*)::int from periods where end_time > start_time), 8,
  'all 8 default periods satisfy the constraint');

select * from finish();
rollback;
