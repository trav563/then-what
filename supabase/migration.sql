-- ============================================
-- Then What? — Supabase Schema Migration
-- ============================================

-- 1. Puzzles table
CREATE TABLE IF NOT EXISTS puzzles (
  id TEXT PRIMARY KEY,
  number INTEGER,
  title TEXT NOT NULL,
  theme TEXT NOT NULL,
  flavor_text TEXT,
  cards JSONB NOT NULL DEFAULT '[]',
  correct_order JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ai_reviewed', 'approved', 'scheduled', 'published', 'retired', 'rejected')),
  scheduled_for DATE,
  evaluation JSONB,
  source TEXT,
  notes TEXT,
  generation_batch_id TEXT,
  similarity_warning TEXT,
  is_auto_recommended BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ
);

-- 2. Schedule table (date → puzzle mapping)
CREATE TABLE IF NOT EXISTS schedule (
  date DATE PRIMARY KEY,
  puzzle_id TEXT NOT NULL REFERENCES puzzles(id)
);

-- 3. Enable RLS
ALTER TABLE puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- PUBLIC: Anyone can read TODAY's scheduled puzzle only
CREATE POLICY "Public can read today's puzzle"
  ON puzzles FOR SELECT
  USING (
    id IN (SELECT puzzle_id FROM schedule WHERE date = CURRENT_DATE)
  );

CREATE POLICY "Public can read today's schedule"
  ON schedule FOR SELECT
  USING (date = CURRENT_DATE);

-- ADMIN: Authenticated users get full access
CREATE POLICY "Admin full access to puzzles"
  ON puzzles FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin full access to schedule"
  ON schedule FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 5. Secure RPC function for public puzzle fetch
CREATE OR REPLACE FUNCTION get_today_puzzle()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'number', p.number,
    'title', p.title,
    'theme', p.theme,
    'flavor_text', p.flavor_text,
    'cards', p.cards,
    'correct_order', p.correct_order
  ) INTO result
  FROM puzzles p
  JOIN schedule s ON s.puzzle_id = p.id
  WHERE s.date = CURRENT_DATE
  LIMIT 1;

  RETURN result;
END;
$$;
