-- Add new columns for Rotating Facts
ALTER TABLE puzzles 
ADD COLUMN IF NOT EXISTS is_true_story BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fun_fact TEXT;

-- Drop the old function so we can recreate it with new return signature
DROP FUNCTION IF EXISTS get_today_puzzle(date);

-- Recreate the function to return the new columns
CREATE OR REPLACE FUNCTION get_today_puzzle(target_date date DEFAULT CURRENT_DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    'is_true_story', p.is_true_story,
    'fun_fact', p.fun_fact,
    'cards', p.cards,
    'correct_order', p.correct_order
  ) INTO result
  FROM puzzles p
  JOIN schedule s ON p.id = s.puzzle_id
  WHERE s.date = target_date
  LIMIT 1;

  RETURN result;
END;
$$;

-- Create an RPC to fetch the Global Pulse distribution for a specific puzzle
-- It counts how many users solved it in 1, 2, 3, 4, 5 attempts, or failed.
CREATE OR REPLACE FUNCTION get_puzzle_distribution(p_puzzle_id uuid)
RETURNS TABLE (
  attempts integer,
  count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (data->>'attempts')::integer as attempts,
    COUNT(*) as count
  FROM analytics_events
  WHERE puzzle_id = p_puzzle_id 
    AND type = 'puzzle_completed'
    AND data->>'status' = 'won'
  GROUP BY (data->>'attempts')::integer
  
  UNION ALL
  
  SELECT 
    -1 as attempts, -- -1 represents 'failed'
    COUNT(*) as count
  FROM analytics_events
  WHERE puzzle_id = p_puzzle_id 
    AND type = 'puzzle_completed'
    AND data->>'status' = 'failed';
END;
$$;

-- CLEAR FUTURE PUZZLES
-- As requested, we need to clear out older generated puzzles so we can replace them 
-- with the new fact-based puzzles. We will KEEP today's puzzle and any past puzzles.

-- 1. Delete scheduled entries that are in the future
DELETE FROM schedule WHERE date > CURRENT_DATE;

-- 2. Delete any puzzles that are no longer in the schedule (this clears out all the un-scheduled, pending, or future puzzles)
DELETE FROM puzzles WHERE id NOT IN (SELECT puzzle_id FROM schedule);
