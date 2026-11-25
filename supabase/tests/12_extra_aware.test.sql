begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

set local app.now = '2026-03-02 09:00';

select tests.create_user('t@x.com', 'teacher', 'active', true) as t \gset
select tests.create_user('g@x.com', 'grad') as g \gset
select tests.create_user('u@x.com', 'undergrad', 'active', false, :'g'::uuid) as u \gset
select tests.create_user('u2@x.com', 'undergrad', 'active', false, :'g'::uuid) as u2 \gset
select tests.create_user('u3@x.com', 'undergrad', 'active', false, :'g'::uuid) as u3 \gset
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'g'::uuid, id, 1, p from semesters, (values (3), (4)) v(p);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'t'::uuid, id, 1, 3 from semesters;

-- A. weekly changes vs extras (Tue 2026-03-17 period 5, extra only)
insert into slot_exceptions (user_id, date, period, kind) values
  (:'g'::uuid, '2026-03-17', 5, 'extra'), (:'g'::uuid, '2026-03-24', 5, 'extra');
select tests.make_booking(:'u'::uuid, '2026-03-17', 5::smallint) as b \gset
select tests.login_as(:'g'::uuid);
select set_weekly_slot(2::smallint, 5::smallint, false) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'template-off with only an extra: applied without warning');
select is((:'r'::jsonb)->'affected', '[]'::jsonb, 'template-off with extra: nothing affected');
select is((select status::text from bookings where id = :'b'::uuid), 'confirmed', 'booking on extra date stays confirmed');
select ok(is_present(:'g'::uuid, '2026-03-17', 5::smallint), 'extra still present');

select tests.login_as(:'g'::uuid);
select set_weekly_slot(2::smallint, 5::smallint, true) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'template-on applies');
select is((select count(*)::int from slot_exceptions where user_id = :'g'::uuid and kind = 'extra' and period = 5), 0,
  'template-on deletes redundant extras');
select ok(is_present(:'g'::uuid, '2026-03-17', 5::smallint), 'present via template after extras removed');
select is((select status::text from bookings where id = :'b'::uuid), 'confirmed', 'booking untouched by template-on');

-- template + extra both present (direct data): template-off must not warn
insert into slot_exceptions (user_id, date, period, kind) values (:'g'::uuid, '2026-03-17', 5, 'extra');
select tests.login_as(:'g'::uuid);
select set_weekly_slot(2::smallint, 5::smallint, false) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'template-off with template+extra: no warning');
select is((select status::text from bookings where id = :'b'::uuid), 'confirmed', 'booking still confirmed');
select ok(is_present(:'g'::uuid, '2026-03-17', 5::smallint), 'still present via extra');

-- without an extra, template-off still warns
select tests.login_as(:'g'::uuid);
select set_weekly_slot(2::smallint, 6::smallint, true);
select tests.logout();
select tests.make_booking(:'u2'::uuid, '2026-03-17', 6::smallint) as b6 \gset
select tests.login_as(:'g'::uuid);
select set_weekly_slot(2::smallint, 6::smallint, false) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'false', 'template-off without extra still warns');

-- B. add_exception over an extra
insert into slot_exceptions (user_id, date, period, kind) values (:'g'::uuid, '2026-03-31', 5, 'extra');
select tests.make_booking(:'u'::uuid, '2026-03-31', 5::smallint) as b2 \gset
select tests.login_as(:'g'::uuid);
select add_exception('2026-03-31', 5::smallint) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'false', 'add_exception over booked extra warns');
select is((select kind from slot_exceptions where user_id = :'g'::uuid and date = '2026-03-31' and period = 5), 'extra',
  'warn leaves the extra');
select tests.login_as(:'g'::uuid);
select add_exception('2026-03-31', 5::smallint, true) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'add_exception confirm applies');
select is((select kind from slot_exceptions where user_id = :'g'::uuid and date = '2026-03-31' and period = 5), 'off',
  'extra became off');
select ok(not is_present(:'g'::uuid, '2026-03-31', 5::smallint), 'absent after add_exception');
select is((select status::text from bookings where id = :'b2'::uuid), 'cancelled', 'booking cancelled after confirm');

-- C. remove_exception only removes 'off'
insert into slot_exceptions (user_id, date, period, kind) values (:'g'::uuid, '2026-04-07', 5, 'extra');
select tests.login_as(:'g'::uuid);
select remove_exception('2026-04-07', 5::smallint);
select tests.logout();
select is((select count(*)::int from slot_exceptions where user_id = :'g'::uuid and date = '2026-04-07' and period = 5), 1,
  'remove_exception leaves extras');
select tests.login_as(:'g'::uuid);
select remove_exception('2026-03-31', 5::smallint);
select tests.logout();
select is((select count(*)::int from slot_exceptions where user_id = :'g'::uuid and date = '2026-03-31' and period = 5), 0,
  'remove_exception removes off');

-- D. set_day_slot(false) writes no redundant off when already absent
insert into slot_exceptions (user_id, date, period, kind) values (:'g'::uuid, '2026-04-13', null, 'off');
select tests.login_as(:'g'::uuid);
select set_day_slot('2026-04-13', 3::smallint, false);
select tests.logout();
select is((select count(*)::int from slot_exceptions where user_id = :'g'::uuid and date = '2026-04-13' and period = 3), 0,
  'no redundant off under whole-day off');

-- E. available_slots / create_booking with extras, off, whole-day off
-- extra-only cell Wed 2026-03-18 period 2 for both grad and teacher
insert into slot_exceptions (user_id, date, period, kind) values
  (:'g'::uuid, '2026-03-18', 2, 'extra'), (:'t'::uuid, '2026-03-18', 2, 'extra');
select tests.login_as(:'u'::uuid);
select ok(exists (select 1 from available_slots() where date = '2026-03-18' and period = 2),
  'available_slots offers a cell that exists only via extras');
select ok(exists (select 1 from available_slots() where date = '2026-03-23' and period = 3), 'template cell offered');
select tests.logout();
insert into slot_exceptions (user_id, date, period, kind) values (:'g'::uuid, '2026-03-23', 3, 'off');
insert into slot_exceptions (user_id, date, period, kind) values (:'t'::uuid, '2026-03-30', null, 'off');
select tests.login_as(:'u'::uuid);
select ok(not exists (select 1 from available_slots() where date = '2026-03-23' and period = 3), 'off removes a template cell');
select ok(not exists (select 1 from available_slots() where date = '2026-03-30' and period = 3), 'whole-day off removes a template cell');
select tests.logout();
select tests.login_as(:'u3'::uuid);
select lives_ok($$select create_booking('2026-03-18', 2::smallint)$$, 'create_booking succeeds on an extra-only cell');
select tests.logout();

-- F. teacher caller, invalid periods, clear on whole-day-off date, lunch slot
insert into slot_exceptions (user_id, date, period, kind) values (:'g'::uuid, '2026-04-22', null, 'off');
select tests.login_as(:'t'::uuid);
select set_day_slot('2026-04-20', 3::smallint, false) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'teacher can set_day_slot');
select ok(not is_present(:'t'::uuid, '2026-04-20', 3::smallint), 'teacher absent that date');
select tests.login_as(:'g'::uuid);
select throws_ok($$select set_day_slot('2026-04-21', 0::smallint, true)$$, 'NOT_EDITABLE', 'period 0 rejected');
select throws_ok($$select set_day_slot('2026-04-21', 9::smallint, true)$$, 'NOT_EDITABLE', 'period 9 rejected');
select lives_ok($$select set_day_slot('2026-04-21', 8::smallint, true)$$, 'lunch (period 8) is selectable');
select clear_day_slot('2026-04-22', 3::smallint) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'clear_day_slot on whole-day-off date applies');
select ok(exists (select 1 from slot_exceptions where user_id = :'g'::uuid and date = '2026-04-22' and period is null),
  'clear leaves the whole-day off');

select * from finish();
rollback;
