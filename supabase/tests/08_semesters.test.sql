begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into semesters (name, start_date, end_date, is_current) values ('A', '2026-02-16', '2026-06-30', true);

select throws_ok(
  $$insert into semesters (name, start_date, end_date) values ('B', '2026-06-30', '2026-09-01')$$,
  '23P01', null, 'a semester sharing a boundary day is rejected');
select throws_ok(
  $$insert into semesters (name, start_date, end_date) values ('C', '2026-03-01', '2026-04-01')$$,
  '23P01', null, 'a semester inside another is rejected');
select lives_ok(
  $$insert into semesters (name, start_date, end_date) values ('D', '2026-07-01', '2026-12-31')$$,
  'an adjacent non-overlapping semester is accepted');

select * from finish();
rollback;
