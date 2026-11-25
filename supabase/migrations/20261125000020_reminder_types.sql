-- New notification kinds for the daily reminders (kept in their own migration so the
-- enum values are committed before anything uses them).
alter type notification_type add value if not exists 'booking_reminder';
alter type notification_type add value if not exists 'duty_lead_reminder';
