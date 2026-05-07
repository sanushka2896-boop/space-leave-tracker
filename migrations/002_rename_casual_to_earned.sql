-- Migration 002: Rename "casual" → "earned", remove duplicate, fix overtime threshold
-- Run once in Supabase SQL editor.

-- 1. Ensure the earned key exists with correct label and sort_order=1 (first in list)
insert into leave_types (key, label, default_days, requires_docs, is_active, sort_order)
values ('earned', 'Earned Leave', 20, false, true, 1)
on conflict (key) do update
  set label = 'Earned Leave',
      default_days = 20,
      sort_order = 1;

-- 2. Push all other leave types down so earned stays first
update leave_types set sort_order = 2 where key = 'sick';
update leave_types set sort_order = 3 where key = 'wfh';
update leave_types set sort_order = 4 where key = 'maternity';
update leave_types set sort_order = 5 where key = 'miscarriage';
update leave_types set sort_order = 6 where key = 'sabbatical';

-- 3. Migrate leave_balances rows: casual → earned
--    Must do this before deleting casual from leave_types (FK constraint)
update leave_balances
set leave_type = 'earned'
where leave_type = 'casual';

-- 4. Migrate leaves rows: casual → earned (no FK, but keep data consistent)
update leaves
set type = 'earned'
where type = 'casual';

-- 5. Delete the now-unused casual leave type
delete from leave_types where key = 'casual';
