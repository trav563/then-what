-- Migration 7: Review potentially untrue stories
-- We no longer blindly mark all existing puzzles as true. Instead, we flag any 
-- non-rejected puzzle that has is_true_story = false for manual review.

-- 1. Unschedule them by deleting their schedule entries
DELETE FROM schedule
WHERE puzzle_id IN (
  SELECT id FROM puzzles 
  WHERE (is_true_story = false OR is_true_story IS NULL) 
    AND status IN ('approved', 'scheduled', 'published', 'retired')
);

-- 2. Move them back to ai_reviewed status with a manual fact-check warning
UPDATE puzzles
SET status = 'ai_reviewed',
    notes = '⚠️ MANUAL FACT-CHECK REQUIRED: This puzzle was originally generated as Fiction or was not verified as true. Please verify its truthfulness, toggle "Verified True Story", and re-approve.',
    similarity_warning = '⚠️ MANUAL FACT-CHECK REQUIRED',
    scheduled_for = NULL,
    updated_at = now()
WHERE (is_true_story = false OR is_true_story IS NULL)
  AND status IN ('approved', 'scheduled', 'published', 'retired');
