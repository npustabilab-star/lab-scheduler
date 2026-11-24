-- Semesters must not overlap: is_present / roster join any semester containing the date.
alter table semesters
  add constraint semesters_no_overlap exclude using gist (daterange(start_date, end_date, '[]') with &&);
