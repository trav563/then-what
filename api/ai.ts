import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

  // Verify token with Supabase
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
    // Fetch existing puzzle summaries for duplicate detection
    const existingSummaries = await fetchExistingPuzzleSummaries(supabaseUrl, supabaseServiceKey);

    if (action === 'generate') {
      const result = await generatePuzzles(settings, existingSummaries);
      return res.status(200).json(result);
    } else if (action === 'evaluate') {
      const result = await evaluatePuzzle(puzzle, existingSummaries);
      return res.status(200).json(result);
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "generate" or "evaluate".' });
    }
  } catch (error: any) {
    console.error('AI function error:', error);
    return res.status(500).json({ error: error.message || 'AI generation failed' });
  }
}

// ─── Fetch Existing Puzzle Summaries for Dedup ───

interface PuzzleSummary {
  title: string;
  theme: string;
  firstCard: string;
  lastCard: string;
}

async function fetchExistingPuzzleSummaries(supabaseUrl: string, serviceKey: string): Promise<PuzzleSummary[]> {
  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    // Only check against vetted puzzles — NOT drafts from the current batch
    // (drafts would match against themselves and cause false duplicate rejections)
    const { data, error } = await supabase
      .from('puzzles')
      .select('title, theme, cards, correct_order')
      .in('status', ['ai_reviewed', 'approved', 'scheduled', 'published', 'retired']);

    if (error || !data) {
      console.error('Failed to fetch existing puzzles for dedup:', error);
      return [];
    }

    return data.map((row: any) => {
      const cards = row.cards || [];
      const order = row.correct_order || [];
      const firstCardId = order[0];
      const lastCardId = order[order.length - 1];
      const firstCard = cards.find((c: any) => c.id === firstCardId)?.text || '';
      const lastCard = cards.find((c: any) => c.id === lastCardId)?.text || '';

      return {
        title: row.title || '',
        theme: row.theme || '',
        firstCard,
        lastCard,
      };
    });
  } catch (err) {
    console.error('Error fetching existing puzzles:', err);
    return [];
  }
}

function formatExistingPuzzlesForPrompt(summaries: PuzzleSummary[]): string {
  if (summaries.length === 0) return '';

  const lines = summaries.map((s, i) =>
    `${i + 1}. "${s.title}" (${s.theme}) — starts with "${s.firstCard}", ends with "${s.lastCard}"`
  ).join('\n');

  return `
CRITICAL DUPLICATE PREVENTION — EXISTING PUZZLES IN DATABASE:
The following puzzles already exist. You MUST NOT generate any puzzle about the same event, incident, phenomenon, or concept — even if you use a different title, different wording, or a different angle. These topics are PERMANENTLY OFF-LIMITS:

${lines}

If you are tempted to generate a puzzle about any of the same real-world events, historical incidents, or story concepts listed above, you MUST choose a completely different topic instead.
`;
}

// ─── Generate Puzzles ───

async function generatePuzzles(
  settings: { count: number; themeMix?: string; instructionEmphasis?: string; excludeThemes?: string },
  existingSummaries: PuzzleSummary[]
) {
  const dedupBlock = formatExistingPuzzlesForPrompt(existingSummaries);

  const prompt = `
You are an expert puzzle designer for a narrative sequencing game called "Then What?".
The game presents players with 6 sentences out of order. The player must arrange them into the correct chronological sequence.

Generate a batch of ${settings.count} new puzzles. 
CRITICAL RULE: ALL (${settings.count}) of your puzzles MUST be "Bizarre True Stories". Do not generate any fictional stories.

FORMAT: Bizarre True Stories
- A true, verified, bizarre, hilarious, or fascinating historical event/phenomenon told as a micro-story (e.g., The Great Emu War, the first cat in space). Pull from incredibly diverse buckets: accidental discoveries, strange nature, obscure history, aviation, internet lore, heists, bizarre sports anomalies, tech blunders, etc.
- Provide exactly 6 chronological cards.
- Provide 'story_text' that politely stitches the cards into a short narrative paragraph.
- Set 'is_true_story' to true for EVERY puzzle.
- REQUIRED: The 'fun_fact' MUST be an Epilogue or additional historical context about the actual event itself (e.g., what happened next, the consequences, or the bizarre aftermath). DO NOT provide generic encyclopedia trivia! (e.g., If the story is about Napoleon fighting rabbits, do NOT provide biological facts about rabbits. Provide a historical fact about the aftermath of the specific event).

Content Rules for BOTH:
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
  return JSON.parse(text);
}

// ─── Evaluate a Puzzle ───

async function evaluatePuzzle(
  puzzle: { title: string; theme: string; cards: { id: string; text: string }[]; correctOrder: string[]; isTrueStory?: boolean; funFact?: string; },
  existingSummaries: PuzzleSummary[]
) {
  const cardsInOrder = puzzle.correctOrder.map((id, index) => {
    const card = puzzle.cards.find((c: any) => c.id === id);
    return `${index + 1}. ${card?.text || '???'}`;
  }).join('\n');

  const existingList = existingSummaries.length > 0
    ? existingSummaries.map((s, i) =>
        `${i + 1}. "${s.title}" (${s.theme}) — starts: "${s.firstCard}", ends: "${s.lastCard}"`
      ).join('\n')
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

CRITICAL — DUPLICATE DETECTION:
The following puzzles ALREADY EXIST in our database. You MUST check if the candidate puzzle covers the SAME real-world event, historical incident, or story concept as any existing puzzle — even if the title, wording, or angle is different. Two puzzles about the same underlying event/phenomenon are DUPLICATES.

EXISTING PUZZLES:
${existingList}

Set 'duplicateOfExisting' to true if this puzzle covers the same event/concept as ANY existing puzzle above. Set 'similarityFlag' to a brief explanation if it's a duplicate or near-duplicate (e.g., "Same event as existing puzzle #3 'The London Beer Flood'"). Leave 'similarityFlag' empty if it's not a duplicate.

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
              true_story_trivia_quality: { type: 'NUMBER' },
              duplicateOfExisting: { type: 'BOOLEAN' },
              similarityFlag: { type: 'STRING' },
              likelyDifficulty: { type: 'STRING' },
              recommendedDecision: { type: 'STRING' },
              shortReason: { type: 'STRING' }
            },
            required: ['clarity', 'chronology_logic', 'endingStrength', 'anchorStrength', 'ambiguityRisk', 'novelty', 'true_story_trivia_quality', 'duplicateOfExisting', 'similarityFlag', 'likelyDifficulty', 'recommendedDecision', 'shortReason']
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
