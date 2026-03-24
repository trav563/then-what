-- ============================================
-- Fix timezone issue: accept client's local date
-- ============================================

-- Drop old function and recreate with date parameter
DROP FUNCTION IF EXISTS get_today_puzzle();

CREATE OR REPLACE FUNCTION get_today_puzzle(target_date DATE DEFAULT CURRENT_DATE)
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
  WHERE s.date = target_date
  LIMIT 1;

  RETURN result;
END;
$$;

-- Also update RLS policies to allow reading the puzzle for the requested date
-- (not just CURRENT_DATE which is UTC-based)
DROP POLICY IF EXISTS "Public can read today's puzzle" ON puzzles;
DROP POLICY IF EXISTS "Public can read today's schedule" ON schedule;

-- Allow public to read any scheduled puzzle (the RPC function controls which one is returned)
CREATE POLICY "Public can read scheduled puzzles"
  ON puzzles FOR SELECT
  USING (
    status = 'scheduled' OR status = 'published'
    OR id IN (SELECT puzzle_id FROM schedule)
  );

CREATE POLICY "Public can read schedule"
  ON schedule FOR SELECT
  USING (true);
