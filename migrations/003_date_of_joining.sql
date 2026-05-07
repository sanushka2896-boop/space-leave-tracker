-- Migration 003: Add date_of_joining to users table
-- Run once in Supabase SQL editor.

ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_joining date;
