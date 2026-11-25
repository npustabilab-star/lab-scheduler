begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- today = Mon 2026-03-02, tomorrow = Tue 03-03
set local app.now = '2026-03-02 09:00';

select tests.create_user('t@x.com', 'teacher', 'active', true) as t \gset
select tests.create_user('a@x.com', 'grad') as a \gset
select tests.create_user('g@x.com', 'grad') as g \gset
select tests.create_user('u@x.com', 'undergrad', 'active', false, :'g'::uuid) as u \gset
update profiles set display_name = '甲' where id = :'a'::uuid;
update profiles set display_name = '乙' where id = :'g'::uuid;
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);
-- Tue p3: both grads (needs 主值); Tue p5: only 乙
insert into weekly_slots (user_id, semester_id, weekday, period)
  select u, id, 2, 3 from semesters, unnest(array[:'a'::uuid, :'g'::uuid]) u;
insert into weekly_slots (user_id, semester_id, weekday, period) select :'g'::uuid, id, 2, 5 from semesters;

-- pending booking on Fri 03-06 (= today + 4), teacher already ok, grad not
insert into bookings (undergrad_id, teacher_id, grad_id, date, period, teacher_ok)
values (:'u'::uuid, :'t'::uuid, :'g'::uuid, '2026-03-06', 1, true);
-- pending booking further away: no reminder yet
insert into bookings (undergrad_id, teacher_id, grad_id, date, period)
values (:'u'::uuid, :'t'::uuid, :'g'::uuid, '2026-03-20', 1);
delete from notifications;

select is(send_daily_reminders(), 2, 'one booking reminder + one duty-lead reminder');
select is((select count(*)::int from notifications where type = 'booking_reminder'), 1, 'only the unconfirmed party is reminded');
select is((select user_id from notifications where type = 'booking_reminder'), :'g'::uuid, 'the mentor grad gets the booking reminder');
select is((select user_id from notifications where type = 'duty_lead_reminder'), :'t'::uuid, 'teacher gets the duty-lead reminder');
select is((select detail from notifications where type = 'duty_lead_reminder'), '第3節（乙、甲）', 'detail lists the period and grads');
select is(send_daily_reminders(), 0, 'running again sends nothing new');

-- once the teacher picks the lead, no reminder for that date
delete from notifications;
insert into duty_leads (semester_id, weekday, period, user_id) select id, 2, 3, :'a'::uuid from semesters;
select is((select count(*)::int from notifications), 0, 'cleared');
select send_daily_reminders();
select is((select count(*)::int from notifications where type = 'duty_lead_reminder'), 0, 'no duty-lead reminder once 主值 is set');

select * from finish();
rollback;
