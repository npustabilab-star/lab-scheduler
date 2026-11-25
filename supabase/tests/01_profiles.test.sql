begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- new auth user gets pending profile
insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'a@x.com', '{"full_name":"阿文"}');
select results_eq(
  $$select status::text, role::text, display_name from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  $$values ('pending', null::text, '阿文')$$,
  'new auth user gets pending profile');

insert into auth.users (id, email)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'noname@x.com');
select is((select display_name from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'noname', 'display_name falls back to email local part');

-- fixtures
select tests.create_user('admin@x.com', 'teacher', 'active', true) as teacher \gset
select tests.create_user('grad@x.com', 'grad') as grad \gset
select tests.create_user('p@x.com', 'undergrad', 'pending') as pend \gset
select tests.create_user('u2@x.com', 'undergrad', 'pending') as pend2 \gset

-- pending sees only own
select tests.login_as(:'pend');
select is((select count(*) from profiles), 1::bigint, 'pending user sees only own profile');
select tests.logout();

-- active sees all (a@x, noname, teacher, grad, pend, pend2 = 6)
select tests.login_as(:'grad');
select is((select count(*) from profiles), 6::bigint, 'active user sees all profiles');

select tests.logout();

select tests.login_as(:'teacher');
select throws_ok(format($$select set_admin(%L, false)$$, :'teacher'), 'LAST_ADMIN', 'cannot remove last admin');
select tests.logout();



-- the_teacher / current_semester respect the active-only rule
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-01', '2026-06-30', true);
select tests.login_as(:'pend2');
select is(the_teacher(), null::uuid, 'pending user gets null from the_teacher()');
select is((current_semester()).id, null::bigint, 'pending user gets no row from current_semester()');
select tests.logout();
select tests.login_as(:'grad');
select is(the_teacher(), :'teacher'::uuid, 'active user gets the teacher id');
select isnt((current_semester()).id, null::bigint, 'active user gets the current semester');
select tests.logout();
select is(the_teacher(), :'teacher'::uuid, 'trusted backend (no JWT) still gets the teacher id');
-- taipei time
set local app.now = '2026-03-02 00:30';
select is(taipei_today(), '2026-03-02'::date, 'taipei_today uses app.now override');
reset app.now;
select is(date_trunc('minute', taipei_now()), date_trunc('minute', now() at time zone 'Asia/Taipei'),
  'taipei_now defaults to Taipei wall clock');

select * from finish();
rollback;
