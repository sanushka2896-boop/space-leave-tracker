-- Migration 004: Add attendance_balance_logs table
-- Run once in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS attendance_balance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  log_date date default current_date,
  ot_minutes_used int default 0,
  late_minutes_cancelled int default 0,
  net_minutes int default 0,
  note text,
  created_at timestamptz default now()
);

ALTER TABLE attendance_balance_logs DISABLE ROW LEVEL SECURITY;
