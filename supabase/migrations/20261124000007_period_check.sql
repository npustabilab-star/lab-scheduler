alter table periods add constraint periods_time_order check (end_time > start_time);
