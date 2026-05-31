import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─── Dedup tuning ───
// Semantic: cosine similarity of puzzle embeddings. ~0.84 reliably catches the
// same real-world story even when reworded/retitled, without nuking distinct
// puzzles that merely share a theme. Tune against the logged top-match scores.
const EMBED_MODEL = 'text-embedding-004';
const DUP_COSINE = 0.84;
// Lexical backstops (cheap, catch obvious title/opening overlaps).
const DUP_TITLE_JACCARD = 0.6;
const DUP_FIRSTCARD_JACCARD = 0.5;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  // Verify the request has a valid Supabase auth token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured on server' });
  }

  // Verify the JWT with Supabase
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey }
  });

  if (!userRes.ok) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { action, settings, puzzle } = req.body;

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Whole history is off-limits — every status, including retired & rejected.
    const existing = await fetchExistingPuzzles(supabase);

    if (action === 'generate') {
      // Backfill embeddings for any historical puzzle that lacks one, so the
      // semantic check sees the full library.
      await backfillEmbeddings(supabase, existing);
      const result = await generatePuzzles(settings, existing);
      return res.status(200).json(result);
    } else if (action === 'evaluate') {
      const result = await evaluatePuzzle(puzzle, existing);
      return res.status(200).json(result);
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "generate" or "evaluate".' });
    }
  } catch (error: any) {
    console.error('AI function error:', error);
    return res.status(500).json({ error: error.message || 'AI generation failed' });
  }
}

// ─── Existing puzzles (full history) ───

interface ExistingPuzzle {
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

async function fetchExistingPuzzles(supabase: SupabaseClient): Promise<ExistingPuzzle[]> {
  // No status filter: a story is permanently off-limits once it has existed in
  // ANY form (draft, ai_reviewed, approved, scheduled, published, retired, rejected).
  const { data, error } = await supabase
    .from('puzzles')
    .select('id, title, theme, status, cards, correct_order, story_text, fun_fact, is_true_story, embedding');

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
async function backfillEmbeddings(supabase: SupabaseClient, existing: ExistingPuzzle[]): Promise<void> {
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

async function generatePuzzles(
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

async function evaluatePuzzle(
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
