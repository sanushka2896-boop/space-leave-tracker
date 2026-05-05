-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS clock_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  clock_in time,
  clock_out time,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS late_arrivals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  arrival_time time,
  departure_time time,
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
  login_time time,
  logout_time time,
  overtime_minutes integer,
  extra_hours_start time,
  extra_hours_end time,
  reason text,
  compensated_by text,
  approved boolean DEFAULT false,
  approved_by text,
  rejection_reason text,
  created_at timestamptz DEFAULT now()
);
