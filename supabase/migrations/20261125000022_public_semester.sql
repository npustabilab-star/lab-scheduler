-- Public: name of the semester covering a date (for the 總表 heading). No other semester data.
create function public_semester(p_date date) returns text
language sql stable security definer set search_path = public
as $$ select name from semesters where p_date between start_date and end_date order by start_date desc limit 1 $$;
revoke execute on function public_semester(date) from public;
grant execute on function public_semester(date) to anon, authenticated, service_role;
