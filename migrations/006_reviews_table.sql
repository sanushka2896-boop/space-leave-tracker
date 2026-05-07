-- Migration 006: Standardise review table name to 'reviews'
-- Run once in Supabase SQL editor.
-- Safe to re-run: all statements use IF EXISTS / IF NOT EXISTS guards.

-- 1. Rename review_dates → reviews if the old table still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'review_dates'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'reviews'
  ) THEN
    ALTER TABLE review_dates RENAME TO reviews;
  END IF;
END $$;

-- 2. Create reviews from scratch if neither table existed
CREATE TABLE IF NOT EXISTS reviews (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES users(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  type        text        NOT NULL DEFAULT 'annual',
  notes       text,
  created_by  uuid        REFERENCES users(id),
  created_at  timestamptz DEFAULT now()
);

-- 3. Add any columns that may be missing (idempotent)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS notes         text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_by    uuid REFERENCES users(id);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now();
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS employee_notes text;

ALTER TABLE reviews DISABLE ROW LEVEL SECURITY;
