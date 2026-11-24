-- Notifications, pending-booking expiry (pg_cron) and email queue (pg_net).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles on delete cascade,
  type notification_type not null,
  booking_id uuid not null references bookings on delete cascade,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now());
create index notifications_user_idx on notifications (user_id, created_at desc);

alter table notifications enable row level security;
create policy notifications_select on notifications for select using (user_id = auth.uid());
-- no insert/update/delete policies: writes happen only through security definer functions

-- bookings -> notifications: everyone involved except the actor (auth.uid() is null for system actions)
create function notify_booking_change() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_type notification_type;
begin
  v_type := case
    when tg_op = 'INSERT' then 'booking_requested'
    else case new.status
      when 'confirmed' then 'booking_confirmed'
      when 'rejected'  then 'booking_rejected'
      when 'cancelled' then 'booking_cancelled'
      when 'expired'   then 'booking_expired'
      else null end
  end;
  if v_type is null then return null; end if;

  insert into notifications (user_id, type, booking_id)
  select distinct u, v_type, new.id
  from unnest(array[new.undergrad_id, new.teacher_id, new.grad_id]) u
  where u is distinct from auth.uid();
  return null;
end $$;

create trigger bookings_notify_insert after insert on bookings
  for each row execute function notify_booking_change();
create trigger bookings_notify_update after update on bookings
  for each row when (old.status is distinct from new.status)
  execute function notify_booking_change();

create function mark_notifications_read(p_ids bigint[] default null) returns void
language sql security definer set search_path = public
as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null
    and (p_ids is null or id = any(p_ids))
$$;

create function expire_pending_bookings() returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n integer;
begin
  update bookings set status = 'expired'
  where status = 'pending' and taipei_today() >= date - 3;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- email queue: call the notify-email edge function; silently skip when vault secrets are absent
create function queue_notification_email() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then return null; end if;

  begin
    perform net.http_post(
      url := v_url || '/functions/v1/notify-email',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('notification_id', new.id));
  exception when others then
    raise warning 'queue_notification_email failed: %', sqlerrm;
  end;
  return null;
end $$;
create trigger notifications_queue_email after insert on notifications
  for each row execute function queue_notification_email();

revoke execute on function notify_booking_change() from public, anon, authenticated;
revoke execute on function queue_notification_email() from public, anon, authenticated;
revoke execute on function mark_notifications_read(bigint[]) from public, anon;
revoke execute on function expire_pending_bookings() from public, anon, authenticated;

select cron.schedule('expire-pending-bookings', '0 * * * *', 'select expire_pending_bookings()');
