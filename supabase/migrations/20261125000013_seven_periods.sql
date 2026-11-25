-- Period times and labels. Periods 1-7 are classes; period 8 is the lunch slot (午休 13:00-13:20),
-- displayed between 第4節 and 第5節. Display order is start_time order, NOT period-number order.
--
-- Bookings keep their period number: periods 3 and 5-7 keep their numbers while their clock
-- times shift a few minutes (e.g. 3: 10:10-11:00 -> 10:15-11:05, 5: 13:10-14:00 -> 13:30-14:20).
-- Existing period-8 bookings/slots (formerly 16:10-17:00) keep number 8 and now mean the lunch slot.

alter table periods add column label text;
update periods set label = '第' || period || '節' where period between 1 and 7;
update periods set label = '午休' where period = 8;
alter table periods alter column label set not null;

update periods set start_time = '08:10', end_time = '09:00' where period = 1;
update periods set start_time = '09:10', end_time = '10:00' where period = 2;
update periods set start_time = '10:15', end_time = '11:05' where period = 3;
update periods set start_time = '11:10', end_time = '12:00' where period = 4;
update periods set start_time = '13:30', end_time = '14:20' where period = 5;
update periods set start_time = '14:30', end_time = '15:20' where period = 6;
update periods set start_time = '15:30', end_time = '16:20' where period = 7;
update periods set start_time = '13:00', end_time = '13:20' where period = 8;
