begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

-- authenticated tables
select ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'authenticated can SELECT profiles');
select ok(has_table_privilege('authenticated', 'public.bookings', 'SELECT'), 'authenticated can SELECT bookings');
select ok(has_table_privilege('authenticated', 'public.notifications', 'SELECT'), 'authenticated can SELECT notifications');
select ok(has_table_privilege('authenticated', 'public.semesters', 'INSERT'), 'authenticated can INSERT semesters (RLS: admin)');
select ok(has_table_privilege('authenticated', 'public.periods', 'UPDATE'), 'authenticated can UPDATE periods (RLS: admin)');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'authenticated cannot INSERT profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated cannot UPDATE profiles');
select ok(not has_table_privilege('authenticated', 'public.bookings', 'INSERT'), 'authenticated cannot INSERT bookings');
select ok(not has_table_privilege('authenticated', 'public.bookings', 'UPDATE'), 'authenticated cannot UPDATE bookings');
select ok(not has_table_privilege('authenticated', 'public.bookings', 'DELETE'), 'authenticated cannot DELETE bookings');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'UPDATE'), 'authenticated cannot UPDATE notifications');

-- authenticated functions
select ok(has_function_privilege('authenticated', 'public.available_slots()', 'EXECUTE'), 'authenticated can EXECUTE available_slots()');
select ok(has_function_privilege('authenticated', 'public.create_booking(date, smallint, text)', 'EXECUTE'), 'authenticated can EXECUTE create_booking');
select ok(has_function_privilege('authenticated', 'public.password_changed()', 'EXECUTE'), 'authenticated can EXECUTE password_changed()');
select ok(has_function_privilege('authenticated', 'public.is_active_member()', 'EXECUTE'), 'authenticated can EXECUTE is_active_member()');
select ok(has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE'), 'authenticated can EXECUTE is_admin()');
select ok(has_function_privilege('authenticated', 'public.current_semester()', 'EXECUTE'), 'authenticated can EXECUTE current_semester()');
select ok(has_function_privilege('authenticated', 'public.mark_notifications_read(bigint[])', 'EXECUTE'), 'authenticated can EXECUTE mark_notifications_read');
select ok(not has_function_privilege('authenticated', 'public.admin_setup_member(uuid, text, text, user_role, uuid, text, boolean)', 'EXECUTE'), 'authenticated cannot EXECUTE admin_setup_member');
select ok(not has_function_privilege('authenticated', 'public.admin_reset_flag(uuid)', 'EXECUTE'), 'authenticated cannot EXECUTE admin_reset_flag');
select ok(not has_function_privilege('authenticated', 'public.cancel_bookings_internal(uuid[], text)', 'EXECUTE'), 'authenticated cannot EXECUTE cancel_bookings_internal');
select ok(not has_function_privilege('authenticated', 'public.expire_pending_bookings()', 'EXECUTE'), 'authenticated cannot EXECUTE expire_pending_bookings');
select ok(not has_function_privilege('authenticated', 'public.is_teacher_or_grad()', 'EXECUTE'), 'authenticated cannot EXECUTE is_teacher_or_grad');
select ok(not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'), 'authenticated cannot EXECUTE handle_new_user');

select ok(has_function_privilege('anon', 'public.public_board(date, date)', 'EXECUTE'), 'anon can EXECUTE public_board');
select ok(has_function_privilege('anon', 'public.public_periods()', 'EXECUTE'), 'anon can EXECUTE public_periods');

-- service_role
select ok(has_table_privilege('service_role', 'public.profiles', 'UPDATE'), 'service_role can UPDATE profiles');
select ok(has_table_privilege('service_role', 'public.notifications', 'SELECT'), 'service_role can SELECT notifications');
select ok(has_function_privilege('service_role', 'public.admin_setup_member(uuid, text, text, user_role, uuid, text, boolean)', 'EXECUTE'), 'service_role can EXECUTE admin_setup_member');
select ok(has_function_privilege('service_role', 'public.admin_reset_flag(uuid)', 'EXECUTE'), 'service_role can EXECUTE admin_reset_flag');

-- anon
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon cannot SELECT profiles');
select ok(not has_table_privilege('anon', 'public.bookings', 'SELECT'), 'anon cannot SELECT bookings');
select ok(not has_function_privilege('anon', 'public.available_slots()', 'EXECUTE'), 'anon cannot EXECUTE available_slots()');
select ok(not has_function_privilege('anon', 'public.taipei_now()', 'EXECUTE'), 'anon cannot EXECUTE taipei_now()');
select ok(not has_function_privilege('anon', 'public.password_changed()', 'EXECUTE'), 'anon cannot EXECUTE password_changed()');

select ok(not has_function_privilege('authenticated', 'public.queue_notification_email()', 'EXECUTE'), 'authenticated cannot EXECUTE queue_notification_email');
select ok(not has_function_privilege('authenticated', 'public.notify_booking_change()', 'EXECUTE'), 'authenticated cannot EXECUTE notify_booking_change');
select ok(not has_function_privilege('authenticated', 'public.change_affected_json(uuid[])', 'EXECUTE'), 'authenticated cannot EXECUTE change_affected_json');
select ok(has_function_privilege('authenticated', 'public.set_day_slot(date, smallint, boolean, boolean)', 'EXECUTE'), 'authenticated can EXECUTE set_day_slot');
select ok(has_function_privilege('authenticated', 'public.clear_day_slot(date, smallint, boolean)', 'EXECUTE'), 'authenticated can EXECUTE clear_day_slot');
select ok(not has_function_privilege('authenticated', 'public.day_slot_check(date, smallint)', 'EXECUTE'), 'authenticated cannot EXECUTE day_slot_check');

-- sweeps: new objects without a grant decision fail here
select is((select coalesce(array_agg(c.relname::text order by c.relname), '{}') from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m')
    and (has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
         or has_table_privilege('anon', c.oid, 'DELETE,TRUNCATE,TRIGGER'))),
  '{}'::text[], 'anon has no privileges on any public table');

select is((select coalesce(array_agg(replace(p.oid::regprocedure::text, ', ', ',') order by replace(p.oid::regprocedure::text, ', ', ',')), '{}') from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  array['public_board(date,date)','public_periods()'], 'only the public board functions are executable by anon or PUBLIC');

select is((select coalesce(array_agg(replace(p.oid::regprocedure::text, ', ', ',') order by replace(p.oid::regprocedure::text, ', ', ',')), '{}') from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  (select array_agg(x order by x) from unnest(array[
    'is_active_member()','is_admin()','taipei_now()','taipei_today()','the_teacher()','current_semester()',
    'booking_is_upcoming(bookings)','is_present(uuid,date,smallint)','roster(date,date)','uncovered_days(date,date)',
    'available_slots()','create_booking(date,smallint,text)','respond_booking(uuid,boolean,text)','cancel_booking(uuid,text)',
    'set_weekly_slot(smallint,smallint,boolean,boolean,date)','add_exception(date,smallint,boolean)','remove_exception(date,smallint)',
    'add_no_class_day(date,text,boolean)','remove_no_class_day(date)','set_mentor(uuid,uuid,boolean)',
    'set_account_status(uuid,account_status,boolean)','set_admin(uuid,boolean)','mark_notifications_read(bigint[])',
    'password_changed()','set_notify_email(uuid,text)',
    'set_day_slot(date,smallint,boolean,boolean)','clear_day_slot(date,smallint,boolean)',
    'public_board(date,date)','public_periods()','set_display_name(uuid,text)','set_duty_lead(smallint,smallint,uuid)']) x),
  'authenticated EXECUTE set equals the allowlist');

select ok(not has_sequence_privilege('authenticated', 'public.notifications_id_seq', 'USAGE'), 'authenticated has no USAGE on notifications_id_seq');
select ok(has_sequence_privilege('authenticated', 'public.semesters_id_seq', 'USAGE'), 'authenticated has USAGE on semesters_id_seq');
select ok(has_sequence_privilege('service_role', 'public.notifications_id_seq', 'USAGE'), 'service_role has USAGE on notifications_id_seq');

-- every public table has RLS enabled
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, 'every public table has RLS enabled');

select * from finish();
rollback;
