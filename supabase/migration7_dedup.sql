-- Migration 7: Dedup index
-- Adds a functional index on lower(title) for fast duplicate lookups during
-- AI generation similarity checks. Idempotent.

CREATE INDEX IF NOT EXISTS puzzles_lower_title_idx ON puzzles (lower(title));
