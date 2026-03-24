-- ============================================
-- Server-Side Analytics Events Table
-- ============================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'puzzle_loaded', 'puzzle_started', 'attempt_submitted',
    'puzzle_solved', 'puzzle_failed', 'results_shared',
    'streak_continued', 'streak_broken'
  )),
  puzzle_id TEXT NOT NULL,
  event_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT NOT NULL,
  data JSONB DEFAULT '{}'
);

-- Indexes for fast analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_events(event_date);
CREATE INDEX IF NOT EXISTS idx_analytics_puzzle ON analytics_events(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);

-- RLS: anyone can INSERT (anonymous players), only admins can read
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert analytics events"
  ON analytics_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admin can read analytics events"
  ON analytics_events FOR SELECT
  USING (auth.role() = 'authenticated');
