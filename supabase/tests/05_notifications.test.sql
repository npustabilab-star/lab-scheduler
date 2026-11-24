begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

set local app.now = '2026-03-02 09:00';

-- fixtures (as postgres)
select tests.create_user('t@x.com', 'teacher', 'active', true) as t \gset
select tests.create_user('g@x.com', 'grad') as g \gset
select tests.create_user('u@x.com', 'undergrad', 'active', false, :'g'::uuid) as u \gset
select tests.create_user('u2@x.com', 'undergrad', 'active', false, :'g'::uuid) as u2 \gset
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'g'::uuid, id, w, p from semesters, (values (1, 3), (4, 3)) v(w, p);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'t'::uuid, id, w, p from semesters, (values (1, 3), (4, 3)) v(w, p);

-- request notifies teacher and grad
select tests.login_as(:'u'::uuid);
select create_booking('2026-03-09', 3::smallint, 'x') as b \gset
select tests.logout();
select is((select count(*) from notifications where booking_id = :'b'::uuid and user_id = :'t'::uuid and type = 'booking_requested'), 1::bigint, 'request notifies teacher');
select is((select count(*) from notifications where booking_id = :'b'::uuid and user_id = :'g'::uuid and type = 'booking_requested'), 1::bigint, 'request notifies grad');
select is((select count(*) from notifications where booking_id = :'b'::uuid and user_id = :'u'::uuid), 0::bigint, 'request does not notify the requester');

-- confirm notifies other two
select tests.login_as(:'t'::uuid);
select respond_booking(:'b'::uuid, true);
select tests.logout();
select is((select count(*) from notifications where booking_id = :'b'::uuid), 2::bigint, 'teacher_ok only (status unchanged) creates no notification');
select tests.login_as(:'g'::uuid);
select respond_booking(:'b'::uuid, true);
select tests.logout();
select is((select count(*) from notifications where booking_id = :'b'::uuid and type = 'booking_confirmed' and user_id = :'u'::uuid), 1::bigint, 'confirm notifies undergrad');
select is((select count(*) from notifications where booking_id = :'b'::uuid and type = 'booking_confirmed' and user_id = :'t'::uuid), 1::bigint, 'confirm notifies teacher');
select is((select count(*) from notifications where booking_id = :'b'::uuid and type = 'booking_confirmed' and user_id = :'g'::uuid), 0::bigint, 'confirm does not notify the last actor');

-- change RPC cancellation notifies people other than the actor
select tests.login_as(:'t'::uuid);
select add_no_class_day('2026-03-09', '校慶', true);
select tests.logout();
select is((select status::text from bookings where id = :'b'::uuid), 'cancelled', 'no-class day cancelled the booking');
select is((select count(*) from notifications where booking_id = :'b'::uuid and type = 'booking_cancelled' and user_id in (:'u'::uuid, :'g'::uuid)), 2::bigint, 'cancellation notifies undergrad and grad');
select is((select count(*) from notifications where booking_id = :'b'::uuid and type = 'booking_cancelled' and user_id = :'t'::uuid), 0::bigint, 'cancellation does not notify the acting admin');

-- expire after cutoff
select tests.make_booking(:'u2'::uuid, '2026-03-12', 3::smallint, 'pending') as bp \gset
set local app.now = '2026-03-08 23:00';
select is(expire_pending_bookings(), 0, 'not expired before cutoff');
set local app.now = '2026-03-09 00:10';
select is(expire_pending_bookings(), 1, 'expired at cutoff');
select is((select status::text from bookings where id = :'bp'::uuid), 'expired', 'booking status is expired');
select ok((select count(*) = 3 and count(distinct user_id) = 3 from notifications
           where booking_id = :'bp'::uuid and type = 'booking_expired'), 'system expiry notifies all three participants');

-- users read only their own notifications
select tests.login_as(:'u'::uuid);
select is((select count(*) from notifications where user_id <> :'u'::uuid), 0::bigint, 'user sees only own notifications');
select mark_notifications_read();
select tests.logout();
select ok((select bool_and(read_at is not null) from notifications where user_id = :'u'::uuid)
          and (select bool_and(read_at is null) from notifications where user_id = :'t'::uuid),
  'mark_notifications_read touches only own rows');

select is((select count(*) from cron.job where jobname = 'expire-pending-bookings'), 1::bigint, 'cron job registered');
select is(has_function_privilege('authenticated', 'expire_pending_bookings()', 'execute'), false,
  'expire_pending_bookings not executable by authenticated');

select * from finish();
rollback;
