begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

set local app.now = '2026-03-02 09:00';

select tests.create_user('t@x.com', 'teacher', 'active', true) as t \gset
select tests.create_user('g@x.com', 'grad') as g \gset
select tests.create_user('u@x.com', 'undergrad', 'active', false, :'g'::uuid) as u \gset
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'g'::uuid, id, 1, 3 from semesters;

-- A. template has Mon p3, viewed week has an 'off': "every week available" must follow the template
insert into slot_exceptions (user_id, date, period, kind) values
  (:'g'::uuid, '2026-03-09', 3, 'off'), (:'g'::uuid, '2026-03-16', 3, 'off');
select ok(not is_present(:'g'::uuid, '2026-03-09', 3::smallint), 'A: absent on viewed week (off)');
select tests.login_as(:'g'::uuid);
select set_weekly_slot(1::smallint, 3::smallint, true, false, '2026-03-09') as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'A: applied');
select ok(is_present(:'g'::uuid, '2026-03-09', 3::smallint), 'A: present on viewed week afterwards');
select ok(exists (select 1 from slot_exceptions where user_id = :'g'::uuid and date = '2026-03-16' and period = 3 and kind = 'off'),
  'A: other weeks off exception untouched');
select ok(not is_present(:'g'::uuid, '2026-03-16', 3::smallint), 'A: other week still absent');

-- B. template lacks Tue p5, viewed week (and another) has an 'extra': "every week unavailable" removes it on the viewed week
insert into slot_exceptions (user_id, date, period, kind) values
  (:'g'::uuid, '2026-03-10', 5, 'extra'), (:'g'::uuid, '2026-03-17', 5, 'extra');
select tests.make_booking(:'u'::uuid, '2026-03-10', 5::smallint) as b \gset
select tests.make_booking(:'u'::uuid, '2026-03-17', 5::smallint) as b2 \gset
select ok(is_present(:'g'::uuid, '2026-03-10', 5::smallint), 'B: present on viewed week (extra)');
select tests.login_as(:'g'::uuid);
select set_weekly_slot(2::smallint, 5::smallint, false, false, '2026-03-10') as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'false', 'B: viewed-date booking is warned about');
select is(jsonb_array_length((:'r'::jsonb)->'affected'), 1, 'B: only the viewed-date booking is affected');
select is((select status::text from bookings where id = :'b'::uuid), 'confirmed', 'B: nothing cancelled before confirm');
select ok(is_present(:'g'::uuid, '2026-03-10', 5::smallint), 'B: still present before confirm');
select tests.login_as(:'g'::uuid);
select set_weekly_slot(2::smallint, 5::smallint, false, true, '2026-03-10') as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'B: confirm applies');
select ok(not is_present(:'g'::uuid, '2026-03-10', 5::smallint), 'B: absent on viewed week afterwards');
select is((select status::text from bookings where id = :'b'::uuid), 'cancelled', 'B: viewed-date booking cancelled');
select ok(is_present(:'g'::uuid, '2026-03-17', 5::smallint), 'B: other weeks extra untouched');
select is((select status::text from bookings where id = :'b2'::uuid), 'confirmed', 'B: other weeks booking untouched');

-- C. validation
select tests.login_as(:'g'::uuid);
select throws_ok($$select set_weekly_slot(1::smallint, 3::smallint, true, false, '2026-03-10')$$, 'NOT_EDITABLE',
  'C: weekday must match p_date');
select throws_ok($$select set_weekly_slot(1::smallint, 3::smallint, true, false, '2026-02-23')$$, 'NOT_EDITABLE',
  'C: past date not editable');
select lives_ok($$select set_weekly_slot(1::smallint, 3::smallint, true)$$, 'C: p_date stays optional');
select tests.logout();

select * from finish();
rollback;
