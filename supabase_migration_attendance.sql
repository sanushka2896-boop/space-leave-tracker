-- Run this in Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / DO blocks)

CREATE TABLE IF NOT EXISTS clock_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  clock_in text,
  clock_out text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS late_arrivals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  arrival_time text,
  departure_time text,
  minutes_late integer,
  minutes_missed integer,
  reason text,
  pto_deduction_status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS overtime_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  login_time text,
  logout_time text,
  overtime_minutes integer,
  extra_hours_start text,
  extra_hours_end text,
  reason text,
  compensated_by text,
  approved boolean DEFAULT false,
  approved_by text,
  rejection_reason text,
  created_at timestamptz DEFAULT now()
);

-- If you already created the tables with `time` type, run these to convert to text:
-- ALTER TABLE clock_logs ALTER COLUMN clock_in TYPE text;
-- ALTER TABLE clock_logs ALTER COLUMN clock_out TYPE text;
-- ALTER TABLE late_arrivals ALTER COLUMN arrival_time TYPE text;
-- ALTER TABLE late_arrivals ALTER COLUMN departure_time TYPE text;
-- ALTER TABLE overtime_entries ALTER COLUMN login_time TYPE text;
-- ALTER TABLE overtime_entries ALTER COLUMN logout_time TYPE text;
-- ALTER TABLE overtime_entries ALTER COLUMN extra_hours_start TYPE text;
-- ALTER TABLE overtime_entries ALTER COLUMN extra_hours_end TYPE text;
