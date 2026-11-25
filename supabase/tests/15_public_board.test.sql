begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

set local app.now = '2026-03-02 09:00';

select tests.create_user('g@x.com', 'grad') as g \gset
select tests.create_user('g2@x.com', 'grad', 'disabled') as g2 \gset
update profiles set display_name = '小明' where id = :'g'::uuid;
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select u, id, 1, 3 from semesters, unnest(array[:'g'::uuid, :'g2'::uuid]) u;

set local role anon;
select is((select count(*)::int from public_board('2026-03-02', '2026-03-06')), 1, 'anon sees one entry (active grad only)');
select is((select display_name from public_board('2026-03-02', '2026-03-06')), '小明', 'entry carries the display name');
select is((select date::text || '/' || period from public_board('2026-03-02', '2026-03-06')), '2026-03-02/3', 'entry carries date and period');
select is((select count(*)::int from public_board('2026-03-02', '2026-04-30')), 0, 'ranges over two weeks return nothing');
select is((select count(*)::int from public_board('2026-03-06', '2026-03-02')), 0, 'reversed range returns nothing');
select is((select count(*)::int from public_periods()), 8, 'anon sees all 8 periods');
select throws_ok($$select * from profiles$$, '42501', null, 'anon still cannot read profiles');
reset role;

select * from finish();
rollback;
