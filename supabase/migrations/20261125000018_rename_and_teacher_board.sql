-- 1) Admins can rename members (only the teacher can rename the teacher).
create function set_display_name(p_user uuid, p_name text) returns void
language plpgsql security definer set search_path = public
as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
  if v_name = '' or char_length(v_name) > 30 then raise exception 'INVALID_NAME'; end if;
  if exists (select 1 from profiles where id = p_user and role = 'teacher') and not is_active_teacher() then
    raise exception 'ONLY_TEACHER';
  end if;
  update profiles set display_name = v_name where id = p_user;
end $$;
revoke execute on function set_display_name(uuid, text) from public, anon;
grant execute on function set_display_name(uuid, text) to authenticated, service_role;

-- 2) Public board also shows when the teacher is at school (from the teacher's weekly slots / day changes).
drop function public_board(date, date);
create function public_board(p_from date, p_to date)
returns table(date date, period smallint, display_name text, is_teacher boolean)
language sql stable security definer set search_path = public
as $$
  select distinct x.dt, x.per, p.display_name, p.role = 'teacher'
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
  order by 1, 2, 4 desc, 3
$$;
revoke execute on function public_board(date, date) from public;
grant execute on function public_board(date, date) to anon, authenticated, service_role;
