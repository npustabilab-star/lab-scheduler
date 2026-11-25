-- Public board: anyone (no login) can see which grads are in the lab, per date and period.
-- Only names are exposed: no ids, emails, bookings or notes.

create function public_board(p_from date, p_to date)
returns table(date date, period smallint, display_name text)
language sql stable security definer set search_path = public
as $$
  select r.date, r.period, p.display_name
  from roster(p_from, p_to) r
  join profiles p on p.id = r.user_id
  where p_from is not null and p_to is not null
    and p_to >= p_from and p_to - p_from <= 13   -- at most two weeks per call
  order by r.date, r.period, p.display_name
$$;

create function public_periods()
returns table(period smallint, label text, start_time time, end_time time)
language sql stable security definer set search_path = public
as $$
  select period, label, start_time, end_time from periods order by start_time
$$;

revoke execute on function public_board(date, date) from public;
revoke execute on function public_periods() from public;
grant execute on function public_board(date, date) to anon, authenticated, service_role;
grant execute on function public_periods() to anon, authenticated, service_role;
