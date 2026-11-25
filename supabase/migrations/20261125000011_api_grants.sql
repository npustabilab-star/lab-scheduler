-- Explicit API grants.
-- Hosted Supabase projects no longer auto-grant privileges on objects created by
-- migrations (the local stack still does). Without grants every API call fails with
-- "permission denied". Start from a clean slate so local and hosted end in the same state.

revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;
revoke execute on all functions in schema public from public, anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

-- service_role: trusted backend (edge functions, admin scripts)
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- authenticated: browser users. Row level security is the gate (every table has RLS on).
grant select on all tables in schema public to authenticated;
grant insert, update, delete on table semesters, periods to authenticated;  -- admin-only via RLS
grant usage, select on all sequences in schema public to authenticated;

-- authenticated EXECUTE: only functions meant for signed-in users (by full signature).
-- RLS helpers (used inside policies, so authenticated must be able to run them)
grant execute on function
  is_active_member(), is_admin(), taipei_now(), taipei_today(), the_teacher(),
  current_semester(), booking_is_upcoming(bookings)
  to authenticated;
-- presence / booking / admin RPCs
grant execute on function
  is_present(uuid, date, smallint),
  roster(date, date),
  uncovered_days(date, date),
  available_slots(),
  create_booking(date, smallint, text),
  respond_booking(uuid, boolean, text),
  cancel_booking(uuid, text),
  set_weekly_slot(smallint, smallint, boolean, boolean),
  add_exception(date, smallint, boolean),
  remove_exception(date, smallint),
  add_no_class_day(date, text, boolean),
  remove_no_class_day(date),
  set_mentor(uuid, uuid, boolean),
  set_account_status(uuid, account_status, boolean),
  set_admin(uuid, boolean),
  mark_notifications_read(bigint[]),
  password_changed(),
  set_notify_email(uuid, text)
  to authenticated;

-- NOT granted to authenticated (internal / trigger / service-only): handle_new_user,
-- cancel_bookings_internal, change_affected_json, is_teacher_or_grad, notify_booking_change,
-- queue_notification_email, expire_pending_bookings, admin_setup_member, admin_reset_flag,
-- bookings_touch_updated_at. anon gets schema usage only.
