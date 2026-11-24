-- Bookings: table, available slots, create / respond / cancel RPCs.
-- Single teacher => the partial unique index on (date, period) is the double-booking guarantee.

create table bookings (
  id uuid primary key default gen_random_uuid(),
  undergrad_id uuid not null references profiles,
  teacher_id uuid not null references profiles,
  grad_id uuid not null references profiles,
  date date not null,
  period smallint not null references periods,
  note text not null default '',
  status booking_status not null default 'pending',
  teacher_ok boolean not null default false,
  grad_ok boolean not null default false,
  reason text,                              -- 拒絕／取消原因
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create unique index bookings_active_slot on bookings (date, period)
  where status in ('pending','confirmed');
create index bookings_undergrad_idx on bookings (undergrad_id);

create function bookings_touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger bookings_set_updated_at before update on bookings
  for each row execute function bookings_touch_updated_at();

alter table bookings enable row level security;
create policy bookings_select on bookings for select using (
  is_active_member() and (
    status = 'confirmed'
    or auth.uid() in (undergrad_id, teacher_id, grad_id)));

create function booking_is_upcoming(b bookings) returns boolean
language sql stable security definer set search_path = public
as $$ select b.date + (select end_time from periods where period = b.period) > taipei_now() $$;

create function available_slots() returns table(date date, period smallint)
language sql stable security definer set search_path = public
as $$
  select d::date, per.period
  from profiles me
  join profiles m on m.id = me.mentor_id and m.status = 'active'
  cross join lateral current_semester() s
  cross join lateral generate_series(taipei_today() + 7, s.end_date, interval '1 day') d
  cross join periods per
  where me.id = auth.uid() and me.role = 'undergrad' and me.status = 'active'
    and is_present(the_teacher(), d::date, per.period)
    and is_present(m.id, d::date, per.period)
    and not exists (select 1 from bookings b
                    where b.date = d::date and b.period = per.period
                      and b.status in ('pending','confirmed'))
  order by 1, 2
$$;

create function create_booking(p_date date, p_period smallint, p_note text default '') returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me profiles;
  v_id uuid;
begin
  select * into v_me from profiles where id = auth.uid();
  if v_me.id is null or v_me.status <> 'active' or v_me.role <> 'undergrad' then
    raise exception 'NOT_UNDERGRAD';
  end if;
  if v_me.mentor_id is null
     or not exists (select 1 from profiles where id = v_me.mentor_id and status = 'active') then
    raise exception 'NO_MENTOR';
  end if;
  if p_date < taipei_today() + 7 then raise exception 'TOO_SOON'; end if;

  -- serialize this student's own bookings
  perform 1 from profiles where id = auth.uid() for update;
  if exists (select 1 from bookings b
             where b.undergrad_id = auth.uid() and b.status in ('pending','confirmed')
               and booking_is_upcoming(b)) then
    raise exception 'HAS_ACTIVE_BOOKING';
  end if;

  if not exists (select 1 from available_slots() a where a.date = p_date and a.period = p_period) then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  begin
    insert into bookings (undergrad_id, teacher_id, grad_id, date, period, note)
    values (auth.uid(), the_teacher(), v_me.mentor_id, p_date, p_period, coalesce(p_note, ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'SLOT_UNAVAILABLE';
  end;
  return v_id;
end $$;

create function respond_booking(p_booking uuid, p_accept boolean, p_reason text default null)
returns booking_status
language plpgsql security definer set search_path = public
as $$
declare
  b bookings;
  v_status booking_status;
begin
  select * into b from bookings where id = p_booking for update;
  if b.id is null or not is_active_member() or auth.uid() not in (b.teacher_id, b.grad_id) then
    raise exception 'NOT_PARTICIPANT';
  end if;
  if b.status <> 'pending' then raise exception 'NOT_PENDING'; end if;

  if p_accept then
    if auth.uid() = b.teacher_id then b.teacher_ok := true; end if;
    if auth.uid() = b.grad_id then b.grad_ok := true; end if;
    v_status := case when b.teacher_ok and b.grad_ok then 'confirmed' else 'pending' end;
    update bookings set teacher_ok = b.teacher_ok, grad_ok = b.grad_ok, status = v_status
      where id = b.id;
  else
    v_status := 'rejected';
    update bookings set status = v_status, reason = p_reason where id = b.id;
  end if;
  return v_status;
end $$;

create function cancel_booking(p_booking uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public
as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking for update;
  if b.id is null or not is_active_member()
     or auth.uid() not in (b.undergrad_id, b.teacher_id, b.grad_id) then
    raise exception 'NOT_PARTICIPANT';
  end if;
  if b.status not in ('pending','confirmed') or not booking_is_upcoming(b) then
    raise exception 'NOT_CANCELLABLE';
  end if;
  update bookings set status = 'cancelled', reason = p_reason where id = b.id;
end $$;

-- internal: used by other RPCs (e.g. leave / account changes), never directly by clients
create function cancel_bookings_internal(p_ids uuid[], p_reason text) returns void
language sql security definer set search_path = public
as $$
  update bookings set status = 'cancelled', reason = p_reason
  where id = any(p_ids) and status in ('pending','confirmed')
$$;

revoke execute on function booking_is_upcoming(bookings) from public, anon;
revoke execute on function available_slots() from public, anon;
revoke execute on function create_booking(date, smallint, text) from public, anon;
revoke execute on function respond_booking(uuid, boolean, text) from public, anon;
revoke execute on function cancel_booking(uuid, text) from public, anon;
revoke execute on function cancel_bookings_internal(uuid[], text) from public, anon, authenticated;
