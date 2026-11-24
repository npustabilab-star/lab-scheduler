begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

set local app.now = '2026-03-02 09:00';

select tests.create_user('t@x.com', 'teacher', 'active', true) as t \gset
select tests.create_user('g@x.com', 'grad') as g \gset
select tests.create_user('g2@x.com', 'grad') as g2 \gset
select tests.create_user('u@x.com', 'undergrad', 'active', false, :'g'::uuid) as u \gset
select tests.create_user('u2@x.com', 'undergrad', 'active', false, :'g'::uuid) as u2 \gset
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'g'::uuid, id, w, p from semesters, (values (1, 3), (1, 4)) v(w, p);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'t'::uuid, id, 1, 3 from semesters;

-- 1. weekly slot off warns first
select tests.make_booking(:'u'::uuid, '2026-03-09', 3::smallint) as b \gset
select tests.login_as(:'g'::uuid);
select set_weekly_slot(1::smallint, 3::smallint, false) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'false', 'weekly slot off warns: applied=false');
select is(jsonb_array_length((:'r'::jsonb)->'affected'), 1, 'weekly slot off warns: one affected');
select is((:'r'::jsonb)->'affected'->0->>'date', '2026-03-09', 'affected date formatted');
select is((:'r'::jsonb)->'affected'->0->>'undergrad_name', 'u', 'affected undergrad_name');
select ok(exists (select 1 from weekly_slots where user_id = :'g'::uuid and weekday = 1 and period = 3),
  'warn leaves weekly slot in place');
select is((select status::text from bookings where id = :'b'::uuid), 'confirmed', 'warn leaves booking confirmed');

-- 2. confirm cancels
select tests.login_as(:'g'::uuid);
select set_weekly_slot(1::smallint, 3::smallint, false, true) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'confirm: applied=true');
select ok(not exists (select 1 from weekly_slots where user_id = :'g'::uuid and weekday = 1 and period = 3),
  'confirm deletes the slot');
select is((select status::text || '/' || reason from bookings where id = :'b'::uuid),
  'cancelled/時段異動：參與者該時段不在', 'confirm cancels with reason');
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'g'::uuid, id, 1, 3 from semesters;

-- 3. on / unaffected applies immediately; idempotent
select tests.login_as(:'g'::uuid);
select set_weekly_slot(2::smallint, 5::smallint, true) as r \gset
select is((:'r'::jsonb)->>'applied', 'true', 'slot on applies immediately');
select is((:'r'::jsonb)->'affected', '[]'::jsonb, 'slot on has empty affected array');
select lives_ok($$select set_weekly_slot(2::smallint, 5::smallint, true)$$, 'adding existing slot is idempotent');
select lives_ok($$select set_weekly_slot(3::smallint, 8::smallint, false)$$, 'removing missing slot is idempotent');

-- 4. undergrad cannot set slots
select tests.login_as(:'u'::uuid);
select throws_ok($$select set_weekly_slot(2::smallint, 5::smallint, true)$$, 'NOT_ALLOWED', 'undergrad cannot set slots');
select tests.logout();

-- 5/6. exceptions
select tests.make_booking(:'u'::uuid, '2026-03-09', 3::smallint) as b \gset
select tests.login_as(:'t'::uuid);
select add_exception('2026-03-09', 4::smallint) as r \gset
select is((:'r'::jsonb)->>'applied', 'true', 'exception other period: applied');
select is((:'r'::jsonb)->'affected', '[]'::jsonb, 'exception other period: no impact');
select add_exception('2026-03-09', null) as r \gset
select is((:'r'::jsonb)->>'applied', 'false', 'whole-day exception warns');
select is(jsonb_array_length((:'r'::jsonb)->'affected'), 1, 'whole-day exception lists one booking');
select lives_ok($$select add_exception('2026-03-09', 4::smallint)$$, 'adding existing exception is idempotent');
select remove_exception('2026-03-09', 4::smallint);
select tests.logout();
select ok(not exists (select 1 from slot_exceptions where user_id = :'t'::uuid and period = 4),
  'remove_exception deletes it');

-- 7. no-class day
select tests.login_as(:'g'::uuid);
select throws_ok($$select add_no_class_day('2026-03-09', 'x')$$, 'NOT_ADMIN', 'non-admin no-class day');
select tests.login_as(:'t'::uuid);
select add_no_class_day('2026-03-09', '校慶', true) as r \gset
select tests.logout();
select is((select reason from bookings where id = :'b'::uuid), '停課日', 'no-class day cancels with reason');

-- 8. set_mentor
select tests.make_booking(:'u'::uuid, '2026-03-16', 3::smallint) as b \gset
select tests.login_as(:'t'::uuid);
select throws_ok(format($$select set_mentor(%L, %L)$$, :'u', :'u2'), 'INVALID_MENTOR', 'mentor must be a grad');
select set_mentor(:'u'::uuid, :'g2'::uuid, true) as r \gset
select tests.logout();
select is((select reason from bookings where id = :'b'::uuid), '更換指導研究生', 'set_mentor cancels with reason');
select is((select mentor_id from profiles where id = :'u'::uuid), :'g2'::uuid, 'mentor updated');

-- 9. past bookings untouched
select tests.make_booking(:'u2'::uuid, '2026-02-23', 3::smallint) as bp \gset
select tests.login_as(:'g'::uuid);
select set_weekly_slot(1::smallint, 3::smallint, false, true) as r \gset
select tests.logout();
select is((select status::text from bookings where id = :'bp'::uuid), 'confirmed', 'past booking untouched');

-- 10. disabled mentor => NO_MENTOR
select tests.login_as(:'t'::uuid);
select set_account_status(:'g'::uuid, 'disabled', true) as r \gset
select throws_ok($$select set_account_status(auth.uid(), 'disabled', true)$$, 'LAST_ADMIN', 'cannot disable last admin');
select tests.login_as(:'u2'::uuid);
select is((select count(*) from available_slots()), 0::bigint, 'disabled mentor => no available slots');
select throws_ok($$select create_booking('2026-03-16', 3::smallint)$$, 'NO_MENTOR', 'disabled mentor => NO_MENTOR');
select tests.logout();

select * from finish();
rollback;
