begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

set local app.now = '2026-03-02 09:00';

select tests.create_user('t@x.com', 'teacher', 'active', true) as t \gset
select tests.create_user('a@x.com', 'grad', 'active', true) as a \gset
select tests.create_user('g@x.com', 'grad') as g \gset
select tests.create_user('g2@x.com', 'grad', 'disabled') as g2 \gset
update profiles set display_name = '小明' where id = :'g'::uuid;
update profiles set display_name = '老師' where id = :'t'::uuid;
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select u, id, 1, 3 from semesters, unnest(array[:'g'::uuid, :'g2'::uuid]) u;
insert into weekly_slots (user_id, semester_id, weekday, period) select :'t'::uuid, id, 2, 5 from semesters;

set local role anon;
select is((select count(*)::int from public_board('2026-03-02', '2026-03-06') where not is_teacher), 1, 'anon sees one grad entry (active grad only)');
select is((select display_name from public_board('2026-03-02', '2026-03-06') where not is_teacher), '小明', 'entry carries the display name');
select is((select date::text || '/' || period from public_board('2026-03-02', '2026-03-06') where not is_teacher), '2026-03-02/3', 'entry carries date and period');
select is((select date::text || '/' || period || '/' || display_name from public_board('2026-03-02', '2026-03-06') where is_teacher), '2026-03-03/5/老師', 'teacher time is shown and flagged');
select is((select count(*)::int from public_board('2026-03-02', '2026-04-30')), 0, 'ranges over two weeks return nothing');
select is((select count(*)::int from public_board('2026-03-06', '2026-03-02')), 0, 'reversed range returns nothing');
select is((select count(*)::int from public_periods()), 8, 'anon sees all 8 periods');
select is(public_semester('2026-03-02'), 'S', 'anon sees the semester name for a date');
select is(public_semester('2025-01-01'), null, 'no semester outside any term');
select throws_ok($$select * from profiles$$, '42501', null, 'anon still cannot read profiles');
reset role;

select tests.login_as(:'a'::uuid);
select lives_ok(format('select set_display_name(%L::uuid, %L)', :'g', '  阿明 '), 'admin can rename a grad');
select throws_ok(format('select set_display_name(%L::uuid, %L)', :'t', 'X'), 'ONLY_TEACHER', 'non-teacher admin cannot rename the teacher');
select throws_ok(format('select set_display_name(%L::uuid, %L)', :'g', '  '), 'INVALID_NAME', 'blank name rejected');
select tests.login_as(:'g'::uuid);
select throws_ok(format('select set_display_name(%L::uuid, %L)', :'a', 'Y'), 'NOT_ADMIN', 'non-admin cannot rename');
select tests.logout();
select is((select display_name from profiles where id = :'g'::uuid), '阿明', 'name was trimmed and saved');

select * from finish();
rollback;
