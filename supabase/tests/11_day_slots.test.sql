begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

set local app.now = '2026-03-02 09:00';

select tests.create_user('t@x.com', 'teacher', 'active', true) as t \gset
select tests.create_user('g@x.com', 'grad') as g \gset
select tests.create_user('u@x.com', 'undergrad', 'active', false, :'g'::uuid) as u \gset
insert into semesters (name, start_date, end_date, is_current) values ('S', '2026-02-16', '2026-06-30', true);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'g'::uuid, id, 1, p from semesters, (values (3), (4)) v(p);
insert into weekly_slots (user_id, semester_id, weekday, period)
  select :'t'::uuid, id, 1, 3 from semesters;
insert into no_class_days (date, note) values ('2026-03-16', 'holiday');

-- 1. template slot, off for one date only
select tests.login_as(:'g'::uuid);
select set_day_slot('2026-03-09', 3::smallint, false) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'off on unbooked cell applies');
select ok(not is_present(:'g'::uuid, '2026-03-09', 3::smallint), 'off: absent that date');
select ok(is_present(:'g'::uuid, '2026-03-23', 3::smallint), 'off: other weeks still present');
select ok(is_present(:'g'::uuid, '2026-03-09', 4::smallint), 'off: other period same day still present');
select is((select kind from slot_exceptions where user_id = :'g'::uuid and date = '2026-03-09' and period = 3), 'off', 'off row stored');
select tests.login_as(:'g'::uuid);
select lives_ok($$select set_day_slot('2026-03-09', 3::smallint, false)$$, 'off is idempotent');

-- 2. clear restores the template
select clear_day_slot('2026-03-09', 3::smallint) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'clear applies');
select ok(is_present(:'g'::uuid, '2026-03-09', 3::smallint), 'clear restores weekly template');
select is((select count(*)::int from slot_exceptions where user_id = :'g'::uuid and date = '2026-03-09'), 0, 'clear removed the row');

-- 3. set on over template deletes the off row
select tests.login_as(:'g'::uuid);
select set_day_slot('2026-03-09', 3::smallint, false);
select set_day_slot('2026-03-09', 3::smallint, true);
select tests.logout();
select ok(is_present(:'g'::uuid, '2026-03-09', 3::smallint), 'on over template restores');
select is((select count(*)::int from slot_exceptions where user_id = :'g'::uuid and date = '2026-03-09'), 0, 'on over template leaves no row');

-- 4. non-template + on = extra for that date only
select tests.login_as(:'g'::uuid);
select set_day_slot('2026-03-10', 5::smallint, true) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'extra applies');
select ok(is_present(:'g'::uuid, '2026-03-10', 5::smallint), 'extra: present that date');
select ok(not is_present(:'g'::uuid, '2026-03-17', 5::smallint), 'extra: absent other weeks');
select is((select kind from slot_exceptions where user_id = :'g'::uuid and date = '2026-03-10' and period = 5), 'extra', 'extra row stored');
select tests.login_as(:'g'::uuid);
select lives_ok($$select set_day_slot('2026-03-10', 5::smallint, true)$$, 'extra is idempotent');
select clear_day_slot('2026-03-10', 5::smallint);
select tests.logout();
select ok(not is_present(:'g'::uuid, '2026-03-10', 5::smallint), 'clear removes the extra');
select tests.login_as(:'g'::uuid);
select set_day_slot('2026-03-10', 5::smallint, true);
select set_day_slot('2026-03-10', 5::smallint, false);
select tests.logout();
select ok(not is_present(:'g'::uuid, '2026-03-10', 5::smallint), 'off over extra removes it');
select is((select count(*)::int from slot_exceptions where user_id = :'g'::uuid and date = '2026-03-10'), 0, 'off over extra leaves no row');

-- 5. not editable
select tests.login_as(:'g'::uuid);
select throws_ok($$select set_day_slot('2026-02-23', 3::smallint, false)$$, 'NOT_EDITABLE', 'past date');
select throws_ok($$select clear_day_slot('2026-02-23', 3::smallint)$$, 'NOT_EDITABLE', 'clear: past date');
select throws_ok($$select set_day_slot('2026-03-16', 3::smallint, false)$$, 'NOT_EDITABLE', 'no-class day');
select throws_ok($$select set_day_slot('2026-03-14', 3::smallint, true)$$, 'NOT_EDITABLE', 'weekend');
select throws_ok($$select set_day_slot('2026-07-06', 3::smallint, true)$$, 'NOT_EDITABLE', 'outside semester');
select lives_ok($$select set_day_slot('2026-03-02', 4::smallint, false)$$, 'today is editable');
select tests.logout();
select tests.login_as(:'u'::uuid);
select throws_ok($$select set_day_slot('2026-03-23', 3::smallint, false)$$, 'NOT_ALLOWED', 'undergrad cannot set');
select throws_ok($$select clear_day_slot('2026-03-23', 3::smallint)$$, 'NOT_ALLOWED', 'undergrad cannot clear');
select tests.logout();

-- 6. warn then cancel
select tests.make_booking(:'u'::uuid, '2026-03-23', 3::smallint) as b \gset
select tests.login_as(:'g'::uuid);
select set_day_slot('2026-03-23', 3::smallint, false) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'false', 'warn: applied=false');
select is(jsonb_array_length((:'r'::jsonb)->'affected'), 1, 'warn: one affected');
select ok(is_present(:'g'::uuid, '2026-03-23', 3::smallint) and
  (select status::text from bookings where id = :'b'::uuid) = 'confirmed', 'warn changes nothing');
select tests.login_as(:'g'::uuid);
select set_day_slot('2026-03-23', 3::smallint, false, true) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'true', 'confirm: applied=true');
select is((select status::text || '/' || reason from bookings where id = :'b'::uuid),
  'cancelled/時段異動：參與者該時段不在', 'confirm cancels with fixed reason');
select ok(not is_present(:'g'::uuid, '2026-03-23', 3::smallint), 'confirm: absent');

-- 7. clear of an extra over a booking warns too
select tests.login_as(:'g'::uuid);
select set_day_slot('2026-03-24', 2::smallint, true);
select tests.logout();
select tests.make_booking(:'u'::uuid, '2026-03-24', 2::smallint) as b2 \gset
select tests.login_as(:'g'::uuid);
select clear_day_slot('2026-03-24', 2::smallint) as r \gset
select tests.logout();
select is((:'r'::jsonb)->>'applied', 'false', 'clear of booked extra warns');
select ok(is_present(:'g'::uuid, '2026-03-24', 2::smallint), 'clear warn changes nothing');

-- 8. whole-day off + on for one period
insert into slot_exceptions (user_id, date, period, kind) values (:'g'::uuid, '2026-03-30', null, 'off');
select ok(not is_present(:'g'::uuid, '2026-03-30', 3::smallint), 'whole-day off: absent');
select tests.login_as(:'g'::uuid);
select set_day_slot('2026-03-30', 3::smallint, true);
select tests.logout();
select ok(is_present(:'g'::uuid, '2026-03-30', 3::smallint), 'whole-day off + on: period present');
select ok(not is_present(:'g'::uuid, '2026-03-30', 4::smallint), 'whole-day off + on: other template period absent');
select ok(not exists (select 1 from slot_exceptions where user_id = :'g'::uuid and date = '2026-03-30' and period is null),
  'whole-day row replaced');

-- 9. whole-day off + on for a non-template period; stale extra stays suppressed
insert into slot_exceptions (user_id, date, period, kind) values
  (:'g'::uuid, '2026-03-31', null, 'off'), (:'g'::uuid, '2026-03-31', 6, 'extra');
select ok(not is_present(:'g'::uuid, '2026-03-31', 6::smallint), 'whole-day off beats extra in is_present');
select tests.login_as(:'g'::uuid);
select set_day_slot('2026-03-31', 5::smallint, true);
select tests.logout();
select ok(is_present(:'g'::uuid, '2026-03-31', 5::smallint) and not is_present(:'g'::uuid, '2026-03-31', 6::smallint),
  'whole-day off + on non-template period: only that period');

-- 10. roster / uncovered_days
select ok(exists (select 1 from uncovered_days('2026-04-07', '2026-04-07')), 'no slots: day uncovered');
insert into slot_exceptions (user_id, date, period, kind) values (:'g'::uuid, '2026-04-07', 5, 'extra');
select ok(exists (select 1 from roster('2026-04-07', '2026-04-07') where user_id = :'g'::uuid and period = 5),
  'roster includes extra');
select ok(not exists (select 1 from uncovered_days('2026-04-07', '2026-04-07')), 'day with only an extra is not uncovered');
select ok(exists (select 1 from roster('2026-03-09', '2026-03-09') where user_id = :'g'::uuid and period = 4),
  'roster keeps template rows');
insert into slot_exceptions (user_id, date, period, kind) values (:'g'::uuid, '2026-04-13', 4, 'off');
select ok(not exists (select 1 from roster('2026-04-13', '2026-04-13') where period = 4)
  and exists (select 1 from roster('2026-04-13', '2026-04-13') where period = 3), 'roster drops per-period off only');
insert into slot_exceptions (user_id, date, period, kind) values
  (:'g'::uuid, '2026-04-08', null, 'off'), (:'g'::uuid, '2026-04-08', 2, 'extra');
select ok(not exists (select 1 from roster('2026-04-08', '2026-04-08')), 'whole-day off beats extra in roster');
select ok(exists (select 1 from uncovered_days('2026-04-08', '2026-04-08')), 'whole-day off + extra: uncovered');
select throws_ok(
  format($$insert into slot_exceptions (user_id, date, period, kind) values (%L, '2026-04-09', null, 'extra')$$, :'g'),
  '23514', null, 'extra requires a period');

select * from finish();
rollback;
