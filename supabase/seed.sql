-- Local-only test helpers (loaded by `supabase db reset`; never applied to production).
create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.create_user(
  p_email text, p_role user_role, p_status account_status default 'active',
  p_admin boolean default false, p_mentor uuid default null) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, p_email, jsonb_build_object('full_name', split_part(p_email, '@', 1)));
  update public.profiles
     set role = p_role, status = p_status, is_admin = p_admin, mentor_id = p_mentor,
         student_id = split_part(p_email, '@', 1), must_change_password = false
   where id = v_id;
  return v_id;
end $$;

create or replace function tests.login_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end $$;

create or replace function tests.logout() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create or replace function tests.make_booking(
  p_undergrad uuid, p_date date, p_period smallint,
  p_status booking_status default 'confirmed') returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.bookings (id, undergrad_id, teacher_id, grad_id, date, period, status, teacher_ok, grad_ok)
  select v_id, p_undergrad, public.the_teacher(), p.mentor_id, p_date, p_period, p_status,
         p_status = 'confirmed', p_status = 'confirmed'
    from public.profiles p where p.id = p_undergrad;
  return v_id;
end $$;

-- helpers are called by tests while logged in as authenticated/anon
grant execute on all functions in schema tests to authenticated, anon;
