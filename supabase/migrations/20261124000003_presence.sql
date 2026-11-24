-- Presence: who is in the lab, daily roster, days nobody is covered.
-- RLS for weekly_slots / slot_exceptions (active-member select, no write policies) is set in 02_profiles.
-- Guard: no-JWT callers (postgres/service_role) are trusted; otherwise caller must be an active member.

create function is_present(p_user uuid, p_date date, p_period smallint) returns boolean
language sql stable security definer set search_path = public
as $$
  select (auth.uid() is null or is_active_member())
    and exists (
      select 1
      from profiles p
      join semesters s on p_date between s.start_date and s.end_date
      join weekly_slots w on w.user_id = p.id and w.semester_id = s.id
      where p.id = p_user and p.status = 'active'
        and extract(isodow from p_date) between 1 and 5
        and w.weekday = extract(isodow from p_date) and w.period = p_period
        and not exists (select 1 from no_class_days n where n.date = p_date)
        and not exists (select 1 from slot_exceptions e
                        where e.user_id = p_user and e.date = p_date
                          and (e.period is null or e.period = p_period))
    )
$$;

create function roster(p_from date, p_to date)
returns table(date date, user_id uuid, period smallint)
language sql stable security definer set search_path = public
as $$
  select d::date, w.user_id, w.period
  from generate_series(p_from, p_to, interval '1 day') d
  join semesters s on d::date between s.start_date and s.end_date
  join weekly_slots w on w.semester_id = s.id and w.weekday = extract(isodow from d)
  join profiles p on p.id = w.user_id and p.status = 'active' and p.role = 'grad'
  where (auth.uid() is null or is_active_member())
    and not exists (select 1 from no_class_days n where n.date = d::date)
    and not exists (select 1 from slot_exceptions e
                    where e.user_id = w.user_id and e.date = d::date
                      and (e.period is null or e.period = w.period))
$$;

create function uncovered_days(p_from date, p_to date) returns setof date
language sql stable security definer set search_path = public
as $$
  select d::date
  from generate_series(p_from, p_to, interval '1 day') d
  where (auth.uid() is null or is_active_member())
    and extract(isodow from d) between 1 and 5
    and exists (select 1 from semesters s where d::date between s.start_date and s.end_date)
    and not exists (select 1 from no_class_days n where n.date = d::date)
    and not exists (select 1 from roster(d::date, d::date))
  order by 1
$$;

revoke execute on function is_present(uuid, date, smallint) from public, anon;
revoke execute on function roster(date, date) from public, anon;
revoke execute on function uncovered_days(date, date) from public, anon;
