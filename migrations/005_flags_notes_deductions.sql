-- Migration 005: Attendance flags, deductions, and admin notes
-- Run once in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS attendance_deductions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  month text NOT NULL,
  flag_type text NOT NULL,
  leave_deducted numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz default now()
);
ALTER TABLE attendance_deductions DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS attendance_admin_notes (
  user_id uuid primary key references users(id),
  late_note text,
  ot_note text,
  updated_at timestamptz default now()
);
ALTER TABLE attendance_admin_notes DISABLE ROW LEVEL SECURITY;
