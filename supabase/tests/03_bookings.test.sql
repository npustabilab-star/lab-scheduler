begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

set local app.now = '2026-03-02 09:00';

-- fixtures (as postgres)
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

-- available_slots
select tests.login_as(:'u'::uuid);
select ok(exists (select 1 from available_slots() where date = '2026-03-09' and period = 3),
  'available_slots includes teacher+mentor overlap');
select ok(not exists (select 1 from available_slots() where date = '2026-03-02' and period = 3),
  'available_slots excludes less than 7 days ahead');
select ok(not exists (select 1 from available_slots() where date = '2026-03-09' and period = 4),
  'available_slots excludes periods where teacher is absent');
select tests.logout();
insert into no_class_days (date, note) values ('2026-03-16', 'holiday');
select tests.login_as(:'u'::uuid);
select ok(not exists (select 1 from available_slots() where date = '2026-03-16' and period = 3),
  'available_slots excludes no-class day');

-- create_booking
select create_booking('2026-03-09', 3::smallint, '討論題目') as b \gset
select is((select status::text from bookings where id = :'b'::uuid), 'pending', 'create_booking makes a pending booking');
select ok((select teacher_id = :'t'::uuid and grad_id = :'g'::uuid and undergrad_id = :'u'::uuid
           from bookings where id = :'b'::uuid), 'booking has teacher and mentor');
select throws_ok($$select create_booking('2026-03-06', 3::smallint)$$, 'TOO_SOON', 'too soon');
select throws_ok($$select create_booking('2026-03-23', 3::smallint)$$, 'HAS_ACTIVE_BOOKING', 'one active booking per undergrad');
select tests.login_as(:'u2'::uuid);
select throws_ok($$select create_booking('2026-03-09', 3::smallint)$$, 'SLOT_UNAVAILABLE', 'slot taken by pending booking');
select ok(not exists (select 1 from available_slots() where date = '2026-03-09' and period = 3),
  'taken slot not in available_slots');

-- unique index guarantee
select tests.logout();
select throws_ok(
  format($$insert into bookings (undergrad_id, teacher_id, grad_id, date, period, status)
           values (%L, %L, %L, '2026-03-09', 3, 'pending')$$, :'u2', :'t', :'g'),
  '23505', null, 'second active booking on same slot violates unique index');

-- past confirmed booking does not block
select tests.make_booking(:'u2'::uuid, '2026-02-23', 3::smallint);
select tests.login_as(:'u2'::uuid);
select lives_ok($$select create_booking('2026-03-23', 3::smallint)$$, 'past confirmed booking does not block a new one');
select tests.logout();
select id as b2 from bookings where undergrad_id = :'u2'::uuid and date = '2026-03-23' \gset

-- both must accept
select tests.login_as(:'t'::uuid);
select is(respond_booking(:'b'::uuid, true)::text, 'pending', 'teacher accepts, still pending');
select tests.login_as(:'g'::uuid);
select is(respond_booking(:'b'::uuid, true)::text, 'confirmed', 'both accepted -> confirmed');

-- reject frees slot
select is(respond_booking(:'b2'::uuid, false, '那天要考試')::text, 'rejected', 'grad rejects');
select ok((select status = 'rejected' and reason = '那天要考試' from bookings where id = :'b2'::uuid), 'rejection stores reason');
select tests.login_as(:'u'::uuid);
select ok(exists (select 1 from available_slots() where date = '2026-03-23' and period = 3), 'rejected slot is available again');

-- outsider
select tests.login_as(:'u2'::uuid);
select throws_ok(format($$select respond_booking(%L, true)$$, :'b'), 'NOT_PARTICIPANT', 'outsider cannot respond');

-- visibility
select tests.logout();
select tests.make_booking(:'u2'::uuid, '2026-03-30', 3::smallint, 'pending') as bp \gset
select tests.login_as(:'g2'::uuid);
select is((select count(*) from bookings where id = :'bp'::uuid), 0::bigint, 'pending hidden from non-participant');
select is((select count(*) from bookings where id = :'b'::uuid), 1::bigint, 'confirmed visible to active members');

-- cancel
select tests.login_as(:'u'::uuid);
select cancel_booking(:'b'::uuid, '生病');
select is((select status::text from bookings where id = :'b'::uuid), 'cancelled', 'cancel confirmed booking');
select throws_ok(format($$select cancel_booking(%L)$$, :'b'), 'NOT_CANCELLABLE', 'cannot cancel twice');

select tests.logout();
-- bookable dates are limited to the current semester
select tests.logout();
update semesters set start_date = '2026-03-23' where is_current;
insert into semesters (name, start_date, end_date, is_current) values ('OLD', '2026-02-16', '2026-03-22', false);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select u, id, 1, 3 from semesters, (values (:'t'::uuid), (:'g'::uuid)) v(u) where name = 'OLD';
select tests.login_as(:'u'::uuid);
select ok(not exists (select 1 from available_slots() where date < '2026-03-23'),
  'available_slots excludes dates before the current semester');
select ok(exists (select 1 from available_slots() where date = '2026-03-23' and period = 3),
  'available_slots still has current-semester dates');
select throws_ok($$select create_booking('2026-03-09', 3::smallint)$$, 'SLOT_UNAVAILABLE',
  'cannot book in a non-current semester');
select tests.logout();

select is(has_function_privilege('authenticated', 'cancel_bookings_internal(uuid[], text)', 'execute'), false,
  'cancel_bookings_internal not executable by authenticated');

select * from finish();
rollback;
