-- Migration 8: Semantic dedup
-- Stores a per-puzzle embedding vector (as a JSON array of floats) so that
-- newly generated puzzles can be checked for semantic similarity against the
-- ENTIRE history (every status, including retired and rejected) — catching the
-- same story even when it is worded differently or given a new title.
--
-- We store the vector as jsonb (a plain float array) and compute cosine
-- similarity in the serverless function. At this scale (hundreds of puzzles)
-- app-side cosine is trivial and avoids the pgvector extension dependency.

ALTER TABLE puzzles
  ADD COLUMN IF NOT EXISTS embedding JSONB;

-- Functional index to quickly find puzzles that still need backfilling.
CREATE INDEX IF NOT EXISTS puzzles_embedding_null_idx
  ON puzzles ((embedding IS NULL));

curl -H "Authorization: Bearer 5d1c3f73ae78ec1c89754a5aea6f463d63068a2223ce8e2240fe907efe6d4901" https://then-what.vercel.app/api/cron