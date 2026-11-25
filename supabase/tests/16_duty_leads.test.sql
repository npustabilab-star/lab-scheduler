begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local app.now = '2026-03-02 09:00';

select tests.create_user('t@x.com', 'teacher', 'active', true) as t \gset
select tests.create_user('a@x.com', 'grad', 'active', true) as a \gset
select tests.create_user('g@x.com', 'grad') as g \gset
update profiles set display_name = '甲' where id = :'a'::uuid;
update profiles set display_name = '乙' where id = :'g'::uuid;
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select u, id, 1, 3 from semesters, unnest(array[:'a'::uuid, :'g'::uuid]) u;

select tests.login_as(:'a'::uuid);
select throws_ok(format('select set_duty_lead(1::smallint, 3::smallint, %L::uuid)', :'a'), 'ONLY_TEACHER', 'admin grad cannot pick the lead');
select tests.login_as(:'t'::uuid);
select throws_ok(format('select set_duty_lead(2::smallint, 3::smallint, %L::uuid)', :'a'), 'NOT_ON_DUTY', 'lead must be on duty in that slot');
select lives_ok(format('select set_duty_lead(1::smallint, 3::smallint, %L::uuid)', :'g'), 'teacher picks the lead');
select lives_ok(format('select set_duty_lead(1::smallint, 3::smallint, %L::uuid)', :'a'), 'teacher changes the lead');
select is((select user_id from duty_leads), :'a'::uuid, 'one row, latest choice');
select tests.logout();

set local role anon;
select is((select display_name from public_board('2026-03-02', '2026-03-06') where is_lead), '甲', 'public board flags the lead');
select is((select display_name from public_board('2026-03-02', '2026-03-06') where not is_lead), '乙', 'others not flagged');
select throws_ok($$select * from duty_leads$$, '42501', null, 'anon cannot read duty_leads directly');
reset role;

select tests.login_as(:'t'::uuid);
select set_duty_lead(1::smallint, 3::smallint, null);
select tests.logout();
select is((select count(*)::int from duty_leads), 0, 'null clears the lead');

select * from finish();
rollback;
