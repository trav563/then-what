-- ============================================
-- Then What? — Phase 2 Schema Migration
-- Batches & Automation Settings
-- ============================================

-- 1. Batches table (tracks AI generation runs)
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  puzzle_ids JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'evaluating', 'completed', 'failed')),
  summary JSONB
);

-- 2. Automation settings (single-row config)
CREATE TABLE IF NOT EXISTS automation_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  threshold INTEGER NOT NULL DEFAULT 14,
  batch_size INTEGER NOT NULL DEFAULT 20,
  theme_mix TEXT,
  instruction_emphasis TEXT,
  exclude_themes TEXT
);

-- Insert default row
INSERT INTO automation_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- 3. Enable RLS
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies — Admin only (authenticated users)
CREATE POLICY "Admin full access to batches"
  ON batches FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin full access to automation_settings"
  ON automation_settings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
