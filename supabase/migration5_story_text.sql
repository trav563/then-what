-- ============================================
-- Migration 5: Add story_text column and update RPC
-- ============================================

-- Add story_text to puzzles table
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS story_text TEXT;

-- Update the get_today_puzzle RPC to include story_text
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
    'story_text', p.story_text,
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
