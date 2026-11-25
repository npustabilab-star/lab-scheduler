-- pg_net gives up after 5 s by default and the edge runtime then cancels notify-email
-- before Gmail (SMTP) finishes, so no email is sent. Wait up to 60 s instead.
create or replace function queue_notification_email() returns trigger
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
      body := jsonb_build_object('notification_id', new.id),
      timeout_milliseconds := 60000);
  exception when others then
    raise warning 'queue_notification_email failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function queue_notification_email() from public, anon, authenticated;
