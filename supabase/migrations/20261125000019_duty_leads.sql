-- 主值: when several grads are on duty in the same weekly slot, the teacher picks who leads.
-- Set once per (weekday, period) for the semester, like the weekly schedule.

create table duty_leads (
  semester_id bigint not null references semesters(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  period smallint not null check (period between 1 and 8),
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (semester_id, weekday, period)
);
alter table duty_leads enable row level security;
create policy duty_leads_select on duty_leads for select using (is_active_member());
grant select on duty_leads to authenticated;
grant select, insert, update, delete on duty_leads to service_role;

-- p_user null clears the choice.
create function set_duty_lead(p_weekday smallint, p_period smallint, p_user uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_sem semesters;
begin
  if not is_active_teacher() then raise exception 'ONLY_TEACHER'; end if;
  select * into v_sem from current_semester();
  if v_sem.id is null then raise exception 'NO_SEMESTER'; end if;
  if p_user is null then
    delete from duty_leads where semester_id = v_sem.id and weekday = p_weekday and period = p_period;
    return;
  end if;
  if not exists (select 1 from weekly_slots w join profiles p on p.id = w.user_id
                 where w.semester_id = v_sem.id and w.weekday = p_weekday and w.period = p_period
                   and w.user_id = p_user and p.role = 'grad' and p.status = 'active') then
    raise exception 'NOT_ON_DUTY';
  end if;
  insert into duty_leads (semester_id, weekday, period, user_id)
  values (v_sem.id, p_weekday, p_period, p_user)
  on conflict (semester_id, weekday, period) do update set user_id = excluded.user_id;
end $$;
revoke execute on function set_duty_lead(smallint, smallint, uuid) from public, anon;
grant execute on function set_duty_lead(smallint, smallint, uuid) to authenticated, service_role;

-- Public board also flags the lead.
drop function public_board(date, date);
create function public_board(p_from date, p_to date)
returns table(date date, period smallint, display_name text, is_teacher boolean, is_lead boolean)
language sql stable security definer set search_path = public
as $$
  select distinct x.dt, x.per, p.display_name, p.role = 'teacher',
    exists (select 1 from duty_leads l join semesters s on s.id = l.semester_id
            where x.dt between s.start_date and s.end_date
              and l.weekday = extract(isodow from x.dt) and l.period = x.per and l.user_id = x.uid)
  from (
    select d::date as dt, w.user_id as uid, w.period as per
    from generate_series(p_from, p_to, interval '1 day') d
    join semesters s on d::date between s.start_date and s.end_date
    join weekly_slots w on w.semester_id = s.id and w.weekday = extract(isodow from d)
    where not exists (select 1 from slot_exceptions e
                      where e.user_id = w.user_id and e.date = d::date
                        and e.period = w.period and e.kind = 'off')
    union all
    select e.date, e.user_id, e.period
    from slot_exceptions e
    where e.kind = 'extra' and e.date between p_from and p_to
      and extract(isodow from e.date) between 1 and 5
      and exists (select 1 from semesters s where e.date between s.start_date and s.end_date)
  ) x
  join profiles p on p.id = x.uid and p.status = 'active' and p.role in ('grad', 'teacher')
  where p_from is not null and p_to is not null
    and p_to >= p_from and p_to - p_from <= 13
    and not exists (select 1 from no_class_days n where n.date = x.dt)
    and not exists (select 1 from slot_exceptions e
                    where e.user_id = x.uid and e.date = x.dt and e.period is null)
  order by 1, 2, 4 desc, 5 desc, 3
$$;
revoke execute on function public_board(date, date) from public;
grant execute on function public_board(date, date) to anon, authenticated, service_role;

alter publication supabase_realtime add table public.duty_leads;
