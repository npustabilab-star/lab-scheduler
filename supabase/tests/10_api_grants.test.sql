begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

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

-- every public table has RLS enabled
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, 'every public table has RLS enabled');

select * from finish();
rollback;
