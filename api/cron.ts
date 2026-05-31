import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// NOTE: The AI engine (fetchExistingPuzzles / backfillEmbeddings / runGenerate /
// runEvaluate + dedup helpers) is INLINED at the bottom of this file rather than
// imported. Vercel turns every api/ file into its own serverless function and
// crashes (FUNCTION_INVOCATION_FAILED) when a function imports any relative
// module — another api/ route OR a src/ file. So api/ai.ts and api/cron.ts each
// keep a self-contained copy. KEEP THE TWO ENGINE COPIES IN SYNC (esp. DUP_COSINE
// and the generation prompt).

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_MODEL = 'text-embedding-004';
const DUP_COSINE = 0.84;
const DUP_TITLE_JACCARD = 0.6;
const DUP_FIRSTCARD_JACCARD = 0.5;

// ─── Backup auto-scheduler tuning ───
// Trigger when fewer than MIN_RUNWAY upcoming days (starting today) have a puzzle
// scheduled. When triggered, fill every empty day up to TARGET_RUNWAY ahead so we
// don't fire again tomorrow. Both are overridable via automation_settings columns
// (min_days_ahead / target_days_ahead) if you add them; otherwise these defaults.
const DEFAULT_MIN_RUNWAY = 5;
const DEFAULT_TARGET_RUNWAY = 14;

function utcDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Daily autonomous backup. Guarantees the schedule never runs dry when you can't
// review manually. Same gates as the manual/automation paths:
//   GATE 0 — reject duplicates (semantic + lexical, tagged by runGenerate)
//   GATE 1 — reject non-true-stories
//   GATE 2 — reject duplicate/inaccurate/bad-trivia after evaluation
// Only puzzles the evaluator marks "approve" (fact-checked, non-duplicate) are
// auto-scheduled; everything else stays in ai_reviewed for you to review later.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (!CRON_SECRET || !authHeader || authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase env not configured' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const { data: settingsRow } = await supabase
      .from('automation_settings')
      .select('*')
      .eq('id', 'default')
      .single();

    if (!settingsRow || !settingsRow.enabled) {
      return res.status(200).json({ skipped: 'automation disabled' });
    }

    const batchSize = settingsRow.batch_size ?? 20;
    const minRunway = Number(settingsRow.min_days_ahead ?? DEFAULT_MIN_RUNWAY);
    const targetRunway = Math.max(Number(settingsRow.target_days_ahead ?? DEFAULT_TARGET_RUNWAY), minRunway);
    const genSettings = {
      count: batchSize,
      themeMix: settingsRow.theme_mix || undefined,
      instructionEmphasis: settingsRow.instruction_emphasis || undefined,
      excludeThemes: settingsRow.exclude_themes || undefined,
    };

    // Current schedule.
    const { data: scheduleRows } = await supabase.from('schedule').select('*');
    const scheduledDates = new Set<string>();
    const scheduledIds = new Set<string>();
    (scheduleRows || []).forEach((r: any) => { scheduledDates.add(r.date); scheduledIds.add(r.puzzle_id); });

    // Full history (excludes drafts) — used for both the approved pool and dedup.
    const existing = await fetchExistingPuzzles(supabase);

    const todayStr = utcDateStr(new Date());

    // Consecutive days, starting today, that already have a puzzle scheduled.
    const runwayDays = (): number => {
      let n = 0;
      const cur = new Date(todayStr + 'T00:00:00Z');
      while (scheduledDates.has(utcDateStr(cur))) { n++; cur.setUTCDate(cur.getUTCDate() + 1); }
      return n;
    };
    // Empty dates within [today .. today+targetRunway-1], earliest first.
    const emptyWindowDates = (): string[] => {
      const out: string[] = [];
      const cur = new Date(todayStr + 'T00:00:00Z');
      for (let i = 0; i < targetRunway; i++) {
        const d = utcDateStr(cur);
        if (!scheduledDates.has(d)) out.push(d);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      return out;
    };

    const runwayBefore = runwayDays();
    if (runwayBefore >= minRunway) {
      return res.status(200).json({ skipped: 'runway healthy', runwayDays: runwayBefore, minRunway });
    }

    // Assign a queue of puzzle ids onto the earliest empty days in the window.
    const fillSchedule = async (ids: string[]): Promise<number> => {
      let filled = 0;
      for (const date of emptyWindowDates()) {
        const pid = ids.shift();
        if (!pid) break;
        await supabase.from('schedule').upsert({ date, puzzle_id: pid }, { onConflict: 'date' });
        await supabase.from('puzzles').update({
          status: 'scheduled', scheduled_for: date, updated_at: new Date().toISOString(),
        }).eq('id', pid);
        scheduledDates.add(date);
        scheduledIds.add(pid);
        filled++;
      }
      return filled;
    };

    // ── Step A: use existing approved-but-unscheduled inventory first (no AI cost). ──
    const approvedPool = existing
      .filter((p) => p.status === 'approved' && !scheduledIds.has(p.id))
      .map((p) => p.id);
    const filledFromInventory = await fillSchedule(approvedPool);

    let generated = 0;
    let autoScheduledFromGen = 0;
    let rejected = 0;
    let batchId: string | null = null;

    // ── Step B: still short on runway → generate, AI-review, schedule the safe ones. ──
    if (runwayDays() < minRunway && emptyWindowDates().length > 0) {
      const { data: batchesRows } = await supabase
        .from('batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      const inFlight = (batchesRows || []).find((b: any) => b.status === 'generating' || b.status === 'evaluating');

      if (!inFlight) {
        await backfillEmbeddings(supabase, existing);
        // Only generate roughly what's needed to fill the gap (+buffer for
        // rejections), capped at the configured batch size. Keeps the run well
        // under the serverless time limit; daily re-runs cover any shortfall.
        const genCount = Math.min(batchSize, emptyWindowDates().length + 5);
        const rawPuzzles = await runGenerate({ ...genSettings, count: genCount }, existing);
        generated = rawPuzzles.length;

        const now = Date.now();
        batchId = `cronbatch_${now}`;

        const candidates = rawPuzzles.map((raw: any, index: number) => {
          const safeCards = (raw.cards || []).slice(0, 6).map((c: any) => String(c));
          while (safeCards.length < 6) safeCards.push('...');
          const cards = safeCards.map((text: string, i: number) => ({ id: `c${i}`, text }));
          return {
            id: `gen_${now}_${index}`,
            title: raw.title,
            theme: raw.theme,
            cards,
            correctOrder: cards.map((c: any) => c.id),
            status: 'draft' as string,
            source: 'ai_generation',
            createdAt: now,
            updatedAt: now,
            isDuplicate: !!raw.is_duplicate,
            similarityWarning: raw.similarity_warning || undefined,
            storyText: raw.story_text || undefined,
            isTrueStory: raw.is_true_story || false,
            funFact: raw.fun_fact || undefined,
            embedding: Array.isArray(raw.embedding) ? raw.embedding : undefined,
            evaluation: undefined as any,
            isAutoRecommended: false,
            approvedAt: undefined as number | undefined,
            scheduledFor: undefined as string | undefined,
            rejectedAt: undefined as number | undefined,
            generationBatchId: batchId,
          };
        });

        await supabase.from('batches').upsert({
          id: batchId, created_at: now, settings: genSettings,
          puzzle_ids: candidates.map((p) => p.id), status: 'evaluating', summary: null,
        });
        for (const c of candidates) await supabase.from('puzzles').upsert(puzzleToDb(c));

        const genApproved: string[] = [];
        for (const c of candidates) {
          try {
            // GATE 0 — duplicate of a past or in-batch puzzle.
            if (c.isDuplicate) {
              c.status = 'rejected';
              c.rejectedAt = Date.now();
              if (!c.similarityWarning) c.similarityWarning = '🔁 REJECTED: Duplicate of an existing puzzle.';
              await supabase.from('puzzles').upsert(puzzleToDb(c));
              continue;
            }
            // GATE 1 — must be a verified true story.
            if (!c.isTrueStory) {
              c.status = 'rejected';
              c.rejectedAt = Date.now();
              c.similarityWarning = '❌ REJECTED: Not a verified true story. All puzzles must be Bizarre True Stories.';
              await supabase.from('puzzles').upsert(puzzleToDb(c));
              continue;
            }

            const evaluation = await runEvaluate({
              title: c.title, theme: c.theme, cards: c.cards,
              correctOrder: c.correctOrder, isTrueStory: c.isTrueStory, funFact: c.funFact,
            }, existing);
            c.evaluation = evaluation;

            if (evaluation.duplicateOfExisting && evaluation.similarityFlag) {
              c.similarityWarning = `🔁 DUPLICATE: ${evaluation.similarityFlag}`;
            }

            const factAccuracy = evaluation.fact_accuracy ?? 10;
            const triviaQuality = evaluation.true_story_trivia_quality ?? 10;

            // GATE 2 — post-evaluation rejections.
            if (evaluation.duplicateOfExisting) {
              c.status = 'rejected';
              c.rejectedAt = Date.now();
            } else if (factAccuracy < 7) {
              c.status = 'rejected';
              c.rejectedAt = Date.now();
              c.similarityWarning = `❌ FACT-CHECK FAILED: AI evaluator scored fact accuracy ${factAccuracy}/10. Story may not be true.`;
            } else if (triviaQuality < 4) {
              c.status = 'rejected';
              c.rejectedAt = Date.now();
              c.similarityWarning = `⚠️ BAD TRIVIA: Fun fact scored ${triviaQuality}/10 — generic trivia instead of event epilogue.`;
            } else {
              c.status = 'ai_reviewed';
            }

            // Strict flag for the UI "strong candidate" badge.
            c.isAutoRecommended =
              evaluation.clarity >= 9 && evaluation.endingStrength >= 8 &&
              evaluation.anchorStrength >= 8 && evaluation.ambiguityRisk <= 2 &&
              evaluation.novelty >= 6 && factAccuracy >= 8 && triviaQuality >= 6 &&
              !c.similarityWarning && !evaluation.duplicateOfExisting;

            // Publish-safe bar for UNATTENDED scheduling: the evaluator approves it,
            // it's fact-checked and not a duplicate. Looser than the strict badge so
            // the schedule actually fills, but never publishes a rejected/dupe puzzle.
            const publishSafe =
              c.status === 'ai_reviewed' &&
              evaluation.recommendedDecision === 'approve' &&
              !evaluation.duplicateOfExisting &&
              factAccuracy >= 7 && triviaQuality >= 4;

            if (publishSafe) {
              c.status = 'approved';
              c.approvedAt = Date.now();
              genApproved.push(c.id);
            }

            await supabase.from('puzzles').upsert(puzzleToDb(c));
          } catch (e) {
            console.error('Eval failed for', c.id, e);
          }
        }

        rejected = candidates.filter((p) => p.status === 'rejected').length;
        autoScheduledFromGen = await fillSchedule(genApproved);

        await supabase.from('batches').upsert({
          id: batchId, created_at: now, settings: genSettings,
          puzzle_ids: candidates.map((p) => p.id), status: 'completed',
          summary: { generated, autoScheduled: autoScheduledFromGen, rejected },
        });
      }
    }

    return res.status(200).json({
      runwayBefore,
      runwayAfter: runwayDays(),
      minRunway,
      targetRunway,
      filledFromInventory,
      generated,
      autoScheduledFromGen,
      rejected,
      batchId,
    });
  } catch (error: any) {
    console.error('Cron failed:', error);
    return res.status(500).json({ error: error.message || 'Cron failed' });
  }
}

function puzzleToDb(p: any) {
  return {
    id: p.id,
    title: p.title,
    theme: p.theme,
    cards: p.cards,
    correct_order: p.correctOrder,
    status: p.status,
    scheduled_for: p.scheduledFor || null,
    evaluation: p.evaluation || null,
    source: p.source || null,
    generation_batch_id: p.generationBatchId || null,
    similarity_warning: p.similarityWarning || null,
    is_auto_recommended: p.isAutoRecommended || false,
    story_text: p.storyText || null,
    is_true_story: p.isTrueStory || false,
    fun_fact: p.funFact || null,
    embedding: p.embedding || null,
    created_at: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_at: p.approvedAt ? new Date(p.approvedAt).toISOString() : null,
    rejected_at: p.rejectedAt ? new Date(p.rejectedAt).toISOString() : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Inlined AI engine (mirror of api/ai.ts — keep in sync).
// ─────────────────────────────────────────────────────────────────────────
// ─── Existing puzzles (full history) ───

export interface ExistingPuzzle {
  id: string;
  title: string;
  theme: string;
  status: string;
  storyText: string;
  funFact: string;
  isTrueStory: boolean;
  cardsOrdered: string[];
  firstCard: string;
  lastCard: string;
  embedding: number[] | null;
}

export async function fetchExistingPuzzles(supabase: SupabaseClient): Promise<ExistingPuzzle[]> {
  // A story is permanently off-limits once it has reached ANY vetted status:
  // ai_reviewed, approved, scheduled, published, retired, rejected.
  // We EXCLUDE 'draft' on purpose: a batch saves its candidates as drafts BEFORE
  // evaluating them, so including drafts would make every puzzle match its own
  // just-saved row (and its batch siblings) and get wrongly rejected as a
  // duplicate of itself. Intra-batch dupes are still caught in runGenerate.
  const { data, error } = await supabase
    .from('puzzles')
    .select('id, title, theme, status, cards, correct_order, story_text, fun_fact, is_true_story, embedding')
    .neq('status', 'draft');

  if (error || !data) {
    console.error('Failed to fetch existing puzzles for dedup:', error);
    return [];
  }

  return data.map((row: any) => {
    const cards = row.cards || [];
    const order: string[] = row.correct_order || [];
    const textFor = (id: string) => cards.find((c: any) => c.id === id)?.text || '';
    const cardsOrdered = order.length ? order.map(textFor) : cards.map((c: any) => c.text || '');

    return {
      id: row.id,
      title: row.title || '',
      theme: row.theme || '',
      status: row.status || '',
      storyText: row.story_text || '',
      funFact: row.fun_fact || '',
      isTrueStory: !!row.is_true_story,
      cardsOrdered,
      firstCard: cardsOrdered[0] || '',
      lastCard: cardsOrdered[cardsOrdered.length - 1] || '',
      embedding: Array.isArray(row.embedding) ? row.embedding : null,
    };
  });
}

// ─── Embeddings ───

function buildEmbedText(p: { title: string; storyText?: string; cardsOrdered: string[] }): string {
  return [p.title, p.storyText || '', p.cardsOrdered.join(' ')]
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map(text => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
        })),
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini embedding error: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  return (data.embeddings || []).map((e: any) => e.values as number[]);
}

function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Embed any historical puzzle missing an embedding and persist it (one-time
// cost per puzzle; cheap on every run thereafter). Mutates `existing` in place.
export async function backfillEmbeddings(supabase: SupabaseClient, existing: ExistingPuzzle[]): Promise<void> {
  const missing = existing.filter(p => !p.embedding && buildEmbedText(p).length > 0);
  if (missing.length === 0) return;

  const CHUNK = 100;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    let vectors: number[][];
    try {
      vectors = await embedTexts(chunk.map(buildEmbedText));
    } catch (err) {
      console.error('Embedding backfill chunk failed:', err);
      continue;
    }
    await Promise.all(chunk.map(async (p, j) => {
      const vec = vectors[j];
      if (!vec) return;
      p.embedding = vec;
      const { error } = await supabase.from('puzzles').update({ embedding: vec }).eq('id', p.id);
      if (error) console.error('Failed to persist embedding for', p.id, error);
    }));
  }
}

// ─── Lexical backstop (Jaccard token overlap) ───

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'for', 'with', 'by']);

function normalizeTokens(input: string | undefined): Set<string> {
  if (!input) return new Set();
  const cleaned = input.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return new Set(cleaned.split(' ').filter(t => t.length > 1 && !STOPWORDS.has(t)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ─── Duplicate decision ───

interface DupCandidate {
  title: string;
  theme: string;
  firstCard: string;
  embedding: number[] | null;
}

interface DupComparand {
  title: string;
  theme: string;
  firstCard: string;
  embedding: number[] | null;
}

interface DupResult {
  isDuplicate: boolean;
  score: number;
  matchedTitle?: string;
  reason?: string;
}

function detectDuplicate(candidate: DupCandidate, comparands: DupComparand[]): DupResult {
  const candTitleTokens = normalizeTokens(candidate.title);
  const candFirstTokens = normalizeTokens(candidate.firstCard);

  let best: DupResult = { isDuplicate: false, score: 0 };

  for (const e of comparands) {
    // 1) Semantic — the primary signal; catches reworded / retitled same-stories.
    if (candidate.embedding && e.embedding) {
      const sim = cosine(candidate.embedding, e.embedding);
      if (sim >= DUP_COSINE && sim > best.score) {
        best = { isDuplicate: true, score: sim, matchedTitle: e.title, reason: `semantic match ${sim.toFixed(3)}` };
      }
    }

    // 2) Lexical title overlap.
    const titleScore = jaccard(candTitleTokens, normalizeTokens(e.title));
    if (titleScore >= DUP_TITLE_JACCARD && titleScore > best.score) {
      best = { isDuplicate: true, score: titleScore, matchedTitle: e.title, reason: `title overlap ${titleScore.toFixed(2)}` };
    }

    // 3) Same theme + near-identical opening card.
    if (e.theme && candidate.theme && e.theme === candidate.theme && candFirstTokens.size > 0) {
      const firstScore = jaccard(candFirstTokens, normalizeTokens(e.firstCard));
      if (firstScore >= DUP_FIRSTCARD_JACCARD) {
        const composite = firstScore + 0.1;
        if (composite > best.score) {
          best = { isDuplicate: true, score: composite, matchedTitle: e.title, reason: `same theme + opening overlap ${firstScore.toFixed(2)}` };
        }
      }
    }
  }

  return best;
}

// ─── Generate Puzzles ───

function formatExistingPuzzlesForPrompt(existing: ExistingPuzzle[]): string {
  if (existing.length === 0) return '';
  const lines = existing
    .map((s, i) => `${i + 1}. "${s.title}" (${s.theme}) — starts "${s.firstCard}", ends "${s.lastCard}"`)
    .join('\n');
  return `
CRITICAL DUPLICATE PREVENTION — EXISTING PUZZLES IN DATABASE:
The following stories already exist. You MUST NOT generate a puzzle about the same event, incident, phenomenon, or concept — even with a different title, different wording, or a different angle. These topics are PERMANENTLY OFF-LIMITS:

${lines}

If tempted to cover any of the same real-world events above, choose a completely different topic instead.
`;
}

export async function runGenerate(
  settings: { count: number; themeMix?: string; instructionEmphasis?: string; excludeThemes?: string },
  existing: ExistingPuzzle[]
) {
  const dedupBlock = formatExistingPuzzlesForPrompt(existing);

  const prompt = `
You are an expert puzzle designer for a narrative sequencing game called "Then What?".
The game presents players with 6 sentences out of order. The player must arrange them into the correct chronological sequence.

Generate a batch of ${settings.count} new puzzles.
CRITICAL RULE: ALL (${settings.count}) of your puzzles MUST be "Bizarre True Stories". Do not generate any fictional stories.

FORMAT: Bizarre True Stories
- A true, verified, bizarre, hilarious, or fascinating real historical event/phenomenon told as a micro-story. Pull from incredibly diverse buckets: accidental discoveries, strange nature, obscure history, aviation, internet lore, heists, bizarre sports anomalies, tech blunders, etc. Favor lesser-known events over famous ones.
- Provide exactly 6 chronological cards.
- Provide 'story_text' that politely stitches the cards into a short narrative paragraph.
- Set 'is_true_story' to true for EVERY puzzle.
- REQUIRED: The 'fun_fact' MUST be an Epilogue or additional historical context about the actual event itself (e.g., what happened next, the consequences, or the bizarre aftermath). DO NOT provide generic encyclopedia trivia! (e.g., If the story is about Napoleon fighting rabbits, do NOT provide biological facts about rabbits. Provide a historical fact about the aftermath of the specific event).

Content Rules:
- Exactly 6 cards per puzzle.
- CRITICAL: Each card MUST be between 4 and 12 words long. Never generate a card with 3 words or fewer.
- Short, concrete, mobile-readable cards.
- Clear cause-and-effect sequence with no ambiguous middles.
- Avoid vague emotional states, focus on action.

${dedupBlock}

${settings.themeMix ? `CRITICAL THEME REQUIREMENT: You MUST generate puzzles about the following topic/theme: "${settings.themeMix}". This theme OVERRIDES your default diverse bucket selection.` : ''}
${settings.instructionEmphasis ? `Instruction emphasis: ${settings.instructionEmphasis}` : ''}
${settings.excludeThemes ? `CRITICAL EXCLUSION: Do NOT generate puzzles involving: ${settings.excludeThemes}` : ''}

For each puzzle, provide:
- title: A short, catchy title
- theme: The general category (e.g., "History", "Coffee Fails")
- cards: An array of exactly 6 strings in CORRECT chronological order.
- story_text: A polished paragraph that stitches the cards.
- is_true_story: boolean indicating if the narrative itself actually happened.
- fun_fact: a true trivia fact related to the puzzle.
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                theme: { type: 'STRING' },
                cards: { type: 'ARRAY', items: { type: 'STRING' } },
                story_text: { type: 'STRING' },
                is_true_story: { type: 'BOOLEAN' },
                fun_fact: { type: 'STRING' }
              },
              required: ['title', 'theme', 'cards', 'story_text', 'is_true_story']
            }
          }
        }
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const raw: any[] = JSON.parse(text);

  // ─── Semantic + lexical dedup against full history AND within this batch ───
  const candidateEmbedTexts = raw.map(r => buildEmbedText({
    title: r.title || '',
    storyText: r.story_text || '',
    cardsOrdered: (r.cards || []).map((c: any) => String(c)),
  }));

  let candidateVectors: number[][] = [];
  try {
    candidateVectors = await embedTexts(candidateEmbedTexts);
  } catch (err) {
    // If embedding fails, fall back to lexical-only dedup rather than blocking generation.
    console.error('Candidate embedding failed; using lexical-only dedup:', err);
  }

  const historyComparands: DupComparand[] = existing.map(e => ({
    title: e.title, theme: e.theme, firstCard: e.firstCard, embedding: e.embedding,
  }));

  const acceptedComparands: DupComparand[] = [];

  return raw.map((r, i) => {
    const cards: string[] = (r.cards || []).map((c: any) => String(c));
    const embedding = candidateVectors[i] || null;
    const candidate: DupCandidate = {
      title: r.title || '',
      theme: r.theme || '',
      firstCard: cards[0] || '',
      embedding,
    };

    const result = detectDuplicate(candidate, [...historyComparands, ...acceptedComparands]);
    console.log(`[dedup] "${candidate.title}" top=${result.score.toFixed(3)}${result.isDuplicate ? ` DUP of "${result.matchedTitle}" (${result.reason})` : ''}`);

    // Only non-duplicates become comparands for the rest of the batch, so a
    // genuinely-new puzzle still blocks a second copy of itself within the batch.
    if (!result.isDuplicate) {
      acceptedComparands.push({ title: candidate.title, theme: candidate.theme, firstCard: candidate.firstCard, embedding });
    }

    return {
      ...r,
      embedding,
      is_duplicate: result.isDuplicate,
      duplicate_score: result.score,
      similarity_warning: result.isDuplicate
        ? `🔁 DUPLICATE of "${result.matchedTitle}" — ${result.reason}`
        : undefined,
    };
  });
}

// ─── Evaluate a Puzzle ───

export async function runEvaluate(
  puzzle: { title: string; theme: string; cards: { id: string; text: string }[]; correctOrder: string[]; isTrueStory?: boolean; funFact?: string; },
  existing: ExistingPuzzle[]
) {
  const cardsInOrder = puzzle.correctOrder.map((id, index) => {
    const card = puzzle.cards.find((c: any) => c.id === id);
    return `${index + 1}. ${card?.text || '???'}`;
  }).join('\n');

  const existingList = existing.length > 0
    ? existing.map((s, i) => `${i + 1}. "${s.title}" (${s.theme}) — starts: "${s.firstCard}", ends: "${s.lastCard}"`).join('\n')
    : 'No existing puzzles in database.';

  const prompt = `
You are an expert puzzle designer, playtester, and FACT-CHECKER for a narrative sequencing game.
The game presents players with 6 sentences out of order. The player must arrange them into the correct chronological sequence.

CRITICAL MANDATE: ALL puzzles in this game MUST be based on REAL, VERIFIED events that actually happened. There is NO fiction category. If you cannot independently verify that the event described in this puzzle actually occurred in the real world, you MUST reject it.

Evaluate the following candidate puzzle based on these criteria:
- clarity (1-10): How clear is the sequence of events? Is there only one logical order?
- chronology_logic (1-10): Are the events physically and temporally possible? (e.g. jumping out of a plane AFTER landing is impossible).
- ending strength (1-10): Does the final card provide a satisfying punchline or resolution?
- anchor strength (1-10): Are there clear "first" and "last" cards that players can easily identify to anchor their solving process?
- ambiguity risk (1-10): How likely is it that players will validly argue for an alternate order? (1 = very low risk, 10 = very high risk)
- novelty (1-10): Does this feel fresh compared to typical tropes?
- fact_accuracy (1-10): Is this a REAL event that actually happened? Cross-reference your knowledge. Score 1 if the event is fabricated, embellished beyond recognition, or you cannot verify it happened. Score 10 only if you are highly confident this event is real and the details are accurate. THIS IS THE MOST IMPORTANT SCORE.
- true_story_trivia_quality (1-10): The fun_fact MUST be an epilogue or specific historical context about the actual event, NOT a generic fact about the topic. (If it's generic trivia, score it 1. If it provides real aftermath/consequences of the specific event, score it 8-10).
- likely difficulty: "easy", "medium", or "hard"

CRITICAL — TRUTH VERIFICATION:
You must independently verify that this event actually happened. Ask yourself:
1. Did this specific event occur in the real world?
2. Are the key details (people, places, dates, outcomes) accurate?
3. Is the fun fact a true detail about the aftermath of this specific event?
If the answer to ANY of these is "no" or "I'm not sure", set fact_accuracy to 5 or below and set recommendedDecision to "reject".

CRITICAL — DUPLICATE DETECTION (secondary net):
The following puzzles ALREADY EXIST in our database. Check if the candidate covers the SAME real-world event, historical incident, or story concept as any existing puzzle — even if the title, wording, or angle is different. Two puzzles about the same underlying event/phenomenon are DUPLICATES.

EXISTING PUZZLES:
${existingList}

Set 'duplicateOfExisting' to true if this puzzle covers the same event/concept as ANY existing puzzle above. Set 'similarityFlag' to a brief explanation if it's a duplicate or near-duplicate. Leave 'similarityFlag' empty if it's not a duplicate.

If 'duplicateOfExisting' is true, you MUST set 'recommendedDecision' to "reject" and explain in 'shortReason' that it duplicates an existing puzzle.

Then provide a recommended decision ("approve", "revise", or "reject") and a short reason (1-2 sentences).

MANDATORY REJECTION RULES:
- If the event didn't actually happen or you can't verify it → REJECT
- If the fun_fact is false, inaccurate, or unverifiable → REJECT
- If the fun_fact is generic Wikipedia trivia instead of event-specific epilogue → REJECT
- If the chronological sequence contains physical impossibilities → REJECT
- If ANY card has 3 words or fewer → REJECT
- If it duplicates an existing puzzle → REJECT

Puzzle Data:
Title: ${puzzle.title}
Theme: ${puzzle.theme}
True Story: ${puzzle.isTrueStory ? 'Yes' : 'No'}
Fun Fact: ${puzzle.funFact || 'None'}

Cards (in correct chronological order):
${cardsInOrder}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              clarity: { type: 'NUMBER' },
              chronology_logic: { type: 'NUMBER' },
              endingStrength: { type: 'NUMBER' },
              anchorStrength: { type: 'NUMBER' },
              ambiguityRisk: { type: 'NUMBER' },
              novelty: { type: 'NUMBER' },
              fact_accuracy: { type: 'NUMBER' },
              true_story_trivia_quality: { type: 'NUMBER' },
              duplicateOfExisting: { type: 'BOOLEAN' },
              similarityFlag: { type: 'STRING' },
              likelyDifficulty: { type: 'STRING' },
              recommendedDecision: { type: 'STRING' },
              shortReason: { type: 'STRING' }
            },
            required: ['clarity', 'chronology_logic', 'endingStrength', 'anchorStrength', 'ambiguityRisk', 'novelty', 'fact_accuracy', 'true_story_trivia_quality', 'duplicateOfExisting', 'similarityFlag', 'likelyDifficulty', 'recommendedDecision', 'shortReason']
          }
        }
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(text);
}
