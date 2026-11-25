begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);

select tests.create_user('adm@x.com', 'teacher', 'active', true) as adm \gset
select tests.create_user('mc@x.com', 'grad') as mc \gset
select tests.create_user('n1@x.com', 'undergrad', 'pending') as n1 \gset
select tests.create_user('n2@x.com', 'undergrad', 'pending') as n2 \gset
select tests.create_user('g1@x.com', 'grad') as g1 \gset
select tests.create_user('mc2@x.com', 'grad') as mc2 \gset
select tests.create_user('adm2@x.com', 'teacher', 'active', true) as adm2 \gset
select tests.create_user('n3@x.com', 'undergrad', 'pending') as n3 \gset
update profiles set must_change_password = true where id in (:'mc2', :'adm2');
update profiles set must_change_password = true where id = :'mc';

-- must_change user sees nothing
select tests.login_as(:'mc');
select is(is_active_member(), false, 'must_change user is not an active member');
select is((select count(*) from semesters), 0::bigint, 'must_change user sees no semesters');
select is((select count(*) from profiles), 1::bigint, 'must_change user sees only own profile');

-- password_changed clears flag
select password_changed();
select is(is_active_member(), true, 'password_changed clears the flag');
select tests.logout();

-- setup member is service-role only
select tests.login_as(:'g1');
select throws_ok(
  format($$select admin_setup_member(%L, 'S9', 'X', 'grad', null, null, false)$$, :'n1'),
  '42501', null, 'admin_setup_member is service-role only');
select tests.logout();

-- setup (as postgres = trusted backend)
select admin_setup_member(:'n1', 'S100', '同學一', 'grad', null, null, false);
select results_eq(
  format($$select status::text, student_id, must_change_password from profiles where id = %L$$, :'n1'),
  $$values ('active', 's100', true)$$,
  'setup activates the profile and forces a password change');

select throws_ok(
  format($$select admin_setup_member(%L, 'S100', '同學二', 'grad', null, null, false)$$, :'n2'),
  'STUDENT_ID_EXISTS', 'duplicate student id is rejected');

select throws_ok(
  format($$select admin_setup_member(%L, 'T100', '老師', 'teacher', null, null, true)$$, :'n2'),
  'EMAIL_REQUIRED', 'teacher requires an email');

-- set_notify_email
select tests.login_as(:'g1');
select throws_ok(
  format($$select set_notify_email(%L, 'a@b.c')$$, :'n1'),
  'NOT_ADMIN', 'set_notify_email is admin only');
select tests.logout();

select tests.login_as(:'adm');
select set_notify_email(:'n1', '');
select is((select notify_email from profiles where id = :'n1'), null, 'empty string is stored as null');
select throws_ok(
  format($$select set_notify_email(%L, '')$$, :'adm'),
  'EMAIL_REQUIRED', 'teacher cannot clear the notify email');
select tests.logout();


-- fix round 1
select tests.login_as(:'mc2');
select throws_ok($$select set_weekly_slot(1::smallint, 1::smallint, true)$$, 'NOT_ALLOWED', 'must_change grad cannot use teacher/grad RPCs');
select tests.logout();
select tests.login_as(:'adm2');
select is(is_admin(), false, 'must_change admin is not an admin');
select tests.logout();

select tests.login_as(:'n3');
select password_changed();
select tests.logout();
select is((select status::text from profiles where id = :'n3'), 'pending', 'password_changed leaves a pending user pending');

select admin_setup_member(:'n3', ' S100X ', '同學三', 'grad', null, null, false);
select is((select student_id from profiles where id = :'n3'), 's100x', 'student id is trimmed and lower-cased');
select throws_ok(
  format($$select admin_setup_member(%L, 'S100X', 'dup', 'grad', null, null, false)$$, :'n2'),
  'STUDENT_ID_EXISTS', 'student id uniqueness is case-insensitive');
select throws_ok(
  format($$select admin_setup_member(%L, '', 'x', 'grad', null, null, false)$$, :'n2'),
  'INVALID_STUDENT_ID', 'empty student id rejected');
-- self signup stays pending
insert into auth.users (id, email) values ('bbbbbbbb-0000-0000-0000-000000000001', 'self@x.com');
select results_eq(
  $$select status::text, is_admin, student_id is null from profiles where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  $$values ('pending', false, true)$$,
  'self signup stays pending without student id');

select * from finish();
rollback;
