-- ============================================================
-- Migration 001: Extensible leave-type + balance system
-- Run once in your Supabase SQL editor.
-- The old `leave_balance` table is left intact (not dropped)
-- so nothing breaks while you roll out the new code.
-- ============================================================

-- 1. Leave type definitions ----------------------------------
create table if not exists leave_types (
  key           text    primary key,
  label         text    not null,
  default_days  numeric,              -- null = custom duration (sabbatical)
  requires_docs boolean not null default false,
  is_active     boolean not null default true,
  sort_order    int     not null default 0
);

insert into leave_types (key, label, default_days, requires_docs, sort_order) values
  ('casual',      'Casual Leave',       20,   false, 1),
  ('sick',        'Sick Leave',         7,    false, 2),
  ('earned',      'Earned Leave',       15,   false, 3),  -- backward-compat for old rows
  ('maternity',   'Maternity Leave',    56,   true,  4),  -- 8 weeks
  ('miscarriage', 'Miscarriage Leave',  42,   true,  5),  -- 6 weeks
  ('sabbatical',  'Sabbatical',         null, false, 6),  -- custom duration
  ('wfh',         'Work From Home',     null, false, 7)
on conflict (key) do nothing;

-- 2. Per-user leave balances (replaces fixed leave_balance) --
create table if not exists leave_balances (
  user_id    uuid    not null references users(id) on delete cascade,
  leave_type text    not null references leave_types(key),
  allocated  numeric not null default 0,  -- annual entitlement
  balance    numeric not null default 0,  -- remaining (MAY be negative = unpaid)
  primary key (user_id, leave_type)
);

-- 3. Migrate existing leave_balance rows ---------------------
-- sick
insert into leave_balances (user_id, leave_type, allocated, balance)
select user_id, 'sick', sick_leaves, sick_leaves
from   leave_balance
on conflict (user_id, leave_type) do nothing;

-- earned (backward-compat)
insert into leave_balances (user_id, leave_type, allocated, balance)
select user_id, 'earned', earned_leaves, earned_leaves
from   leave_balance
on conflict (user_id, leave_type) do nothing;

-- casual (map from earned quota as starting point; admin can adjust)
insert into leave_balances (user_id, leave_type, allocated, balance)
select user_id, 'casual', earned_leaves, earned_leaves
from   leave_balance
on conflict (user_id, leave_type) do nothing;

-- wfh — migrate existing value first, then correct by role below
insert into leave_balances (user_id, leave_type, allocated, balance)
select user_id, 'wfh', wfh_days, wfh_days
from   leave_balance
on conflict (user_id, leave_type) do nothing;

-- 4. Correct WFH allocations by role -------------------------
--    Junior → 0, *Mid* → 12, everyone else → 20
update leave_balances lb
set    allocated = case
         when u.role ilike '%junior%' then 0
         when u.role ilike '% mid'   then 12
         else 20
       end,
       balance = lb.balance
             + (case
                  when u.role ilike '%junior%' then 0
                  when u.role ilike '% mid'   then 12
                  else 20
                end - lb.allocated)
from   users u
where  lb.user_id   = u.id
and    lb.leave_type = 'wfh';

-- Remove WFH balance for juniors (they are not eligible)
delete from leave_balances
where  leave_type = 'wfh'
and    allocated  = 0
and    balance    = 0;
