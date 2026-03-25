import { supabase } from './supabase';

// Generate a persistent session ID per browser tab
const SESSION_ID = crypto.randomUUID();

type EventType = 'puzzle_loaded' | 'puzzle_started' | 'attempt_submitted' |
  'puzzle_solved' | 'puzzle_failed' | 'results_shared' |
  'streak_continued' | 'streak_broken' | 'gold_solve';

/**
 * Track an analytics event in Supabase.
 * Fire-and-forget — never blocks the game.
 */
export function trackEvent(
  type: EventType,
  puzzleId: string,
  data?: Record<string, unknown>
) {
  // Compute local date string (avoids UTC mismatch)
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
    .toISOString().split('T')[0];

  // Fire-and-forget insert
  supabase
    .from('analytics_events')
    .insert({
      event_type: type,
      puzzle_id: puzzleId,
      event_date: localDate,
      session_id: SESSION_ID,
      data: data ?? {},
    })
    .then(({ error }) => {
      if (error) console.warn('Analytics insert failed:', error.message);
    });
}
