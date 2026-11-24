begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- fixtures (as postgres)
select tests.create_user('t@x.com', 'teacher', 'active', true) as t \gset
select tests.create_user('g@x.com', 'grad') as g \gset
select tests.create_user('p@x.com', 'undergrad', 'pending') as pend \gset
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'g'::uuid, id, w, p from semesters, (values (1, 3), (1, 4)) v(w, p);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'t'::uuid, id, 1, 3 from semesters;

-- present on weekly slot
select is(is_present(:'g'::uuid, '2026-03-02', 3::smallint), true, 'present on weekly slot');
select is(is_present(:'g'::uuid, '2026-03-02', 5::smallint), false, 'not present on other period');
select is(is_present(:'g'::uuid, '2026-03-03', 3::smallint), false, 'not present on other weekday');
select tests.login_as(:'g'::uuid);
select is(is_present(:'g'::uuid, '2026-03-02', 3::smallint), true, 'active caller sees presence');
select tests.logout();

-- roster lists grads only
select results_eq(
  $$select date, user_id, period from roster('2026-03-02', '2026-03-02') order by period$$,
  format($$values ('2026-03-02'::date, %L::uuid, 3::smallint), ('2026-03-02'::date, %L::uuid, 4::smallint)$$, :'g', :'g'),
  'roster lists grads only');
select tests.login_as(:'g'::uuid);
select is((select count(*) from roster('2026-03-02', '2026-03-02')), 2::bigint, 'active caller sees roster');
select tests.logout();

-- uncovered_days basic (weekends excluded)
select results_eq(
  $$select * from uncovered_days('2026-03-02', '2026-03-08') order by 1$$,
  $$values ('2026-03-03'::date), ('2026-03-04'::date), ('2026-03-05'::date), ('2026-03-06'::date)$$,
  'uncovered_days basic');
select tests.login_as(:'g'::uuid);
select is((select count(*) from uncovered_days('2026-03-02', '2026-03-08')), 4::bigint, 'active caller sees uncovered_days');
select tests.logout();

-- no-class days and out-of-semester dates
insert into no_class_days (date, note) values ('2026-03-04', 'holiday');
select results_eq(
  $$select * from uncovered_days('2026-03-02', '2026-03-08') order by 1$$,
  $$values ('2026-03-03'::date), ('2026-03-05'::date), ('2026-03-06'::date)$$,
  'uncovered_days skips no-class days');
select is((select count(*) from uncovered_days('2026-07-01', '2026-07-03')), 0::bigint, 'uncovered_days skips out-of-semester dates');
select is(is_present(:'g'::uuid, '2026-07-06', 3::smallint), false, 'not present outside semester');

-- exception for one period
insert into slot_exceptions (user_id, date, period) values (:'g'::uuid, '2026-03-02', 3);
select is(is_present(:'g'::uuid, '2026-03-02', 3::smallint), false, 'exception removes that period');
select is(is_present(:'g'::uuid, '2026-03-02', 4::smallint), true, 'other period still present');

-- whole-day exception
insert into slot_exceptions (user_id, date, period) values (:'g'::uuid, '2026-03-09', null);
select is(is_present(:'g'::uuid, '2026-03-09', 3::smallint) or is_present(:'g'::uuid, '2026-03-09', 4::smallint),
  false, 'whole-day exception removes all periods');

-- disabled grad not present
update profiles set status = 'disabled' where id = :'g'::uuid;
select is(is_present(:'g'::uuid, '2026-03-02', 4::smallint), false, 'disabled grad not present');
select ok(exists (select 1 from uncovered_days('2026-03-02', '2026-03-02')), 'disabled grad leaves day uncovered');

-- pending caller gets nothing
select tests.login_as(:'pend'::uuid);
select ok(
  not is_present(:'g'::uuid, '2026-03-16', 3::smallint)
  and not exists (select 1 from roster('2026-03-01', '2026-06-30'))
  and not exists (select 1 from uncovered_days('2026-03-01', '2026-06-30')),
  'pending caller gets false/empty');
select tests.logout();

select * from finish();
rollback;
