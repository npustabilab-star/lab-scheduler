begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select is(
  (select array_agg(tablename::text order by tablename::text) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename::text in ('weekly_slots', 'slot_exceptions', 'bookings', 'no_class_days',
                              'notifications', 'profiles', 'semesters', 'periods')),
  array['bookings', 'no_class_days', 'notifications', 'periods',
        'profiles', 'semesters', 'slot_exceptions', 'weekly_slots'],
  'all 8 frontend-subscribed tables are in the supabase_realtime publication');

select * from finish();
rollback;
