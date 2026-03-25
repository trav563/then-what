import type { VercelRequest, VercelResponse } from '@vercel/node';

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
    if (action === 'generate') {
      const result = await generatePuzzles(settings);
      return res.status(200).json(result);
    } else if (action === 'evaluate') {
      const result = await evaluatePuzzle(puzzle);
      return res.status(200).json(result);
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "generate" or "evaluate".' });
    }
  } catch (error: any) {
    console.error('AI function error:', error);
    return res.status(500).json({ error: error.message || 'AI generation failed' });
  }
}

// ─── Generate Puzzles ───

async function generatePuzzles(settings: { count: number; themeMix?: string; instructionEmphasis?: string; excludeThemes?: string }) {
  const prompt = `
You are an expert puzzle designer for a narrative sequencing game called "Then What?".
The game presents players with 6 sentences out of order. The player must arrange them into the correct chronological sequence to tell a cohesive, funny, or relatable micro-story (usually a mishap or awkward situation).

Generate a batch of ${settings.count} new puzzles.

Content Rules:
- Exactly 6 cards per puzzle.
- Short, concrete, mobile-readable cards (about 5-12 words per card).
- Clear opening/setup beat.
- Clear ending/payoff beat.
- Cause-and-effect driven.
- Understandable without niche knowledge.
- Avoid vague emotional states.
- Avoid ambiguous/interchangeable middles.
- Avoid repetitive premises and repetitive endings.
- Tone should fit a short chain-reaction mini-disaster story.

Best categories: social mishaps, office chaos, travel mishaps, party disasters, food fails, public embarrassment, small chain reactions.

${settings.themeMix ? `Theme targeting: ${settings.themeMix}` : ''}
${settings.instructionEmphasis ? `Instruction emphasis: ${settings.instructionEmphasis}` : ''}
${settings.excludeThemes ? `Exclude/reduce these themes: ${settings.excludeThemes}` : ''}

For each puzzle, provide:
- title: A short, catchy title
- theme: The general category (e.g., "office chaos")
- cards: An array of exactly 6 strings, representing the story in the CORRECT chronological order.
- story_text: A single polished paragraph that lightly stitches the 6 cards into a flowing mini-story. Stay faithful to the original card text. You may add very light connective phrasing for readability, but do NOT expand or add new content. The player should feel "that's the story I just built."
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
                story_text: { type: 'STRING' }
              },
              required: ['title', 'theme', 'cards', 'story_text']
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

async function evaluatePuzzle(puzzle: { title: string; theme: string; cards: { id: string; text: string }[]; correctOrder: string[] }) {
  const cardsInOrder = puzzle.correctOrder.map((id, index) => {
    const card = puzzle.cards.find((c: any) => c.id === id);
    return `${index + 1}. ${card?.text || '???'}`;
  }).join('\n');

  const prompt = `
You are an expert puzzle designer and playtester for a narrative sequencing game.
The game presents players with 6 sentences out of order. The player must arrange them into the correct chronological sequence to tell a cohesive, funny, or relatable micro-story (usually a mishap or awkward situation).

Evaluate the following candidate puzzle based on these criteria:
- clarity (1-10): How clear is the sequence of events? Is there only one logical order?
- ending strength (1-10): Does the final card provide a satisfying punchline or resolution?
- anchor strength (1-10): Are there clear "first" and "last" cards that players can easily identify to anchor their solving process?
- ambiguity risk (1-10): How likely is it that players will validly argue for an alternate order? (1 = very low risk, 10 = very high risk)
- novelty (1-10): Does this feel fresh compared to typical tropes?
- likely difficulty: "easy", "medium", or "hard"

Then provide a recommended decision ("approve", "revise", or "reject") and a short reason (1-2 sentences).

Puzzle Data:
Title: ${puzzle.title}
Theme: ${puzzle.theme}
Cards in correct order:
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
              endingStrength: { type: 'NUMBER' },
              anchorStrength: { type: 'NUMBER' },
              ambiguityRisk: { type: 'NUMBER' },
              novelty: { type: 'NUMBER' },
              likelyDifficulty: { type: 'STRING' },
              recommendedDecision: { type: 'STRING' },
              shortReason: { type: 'STRING' }
            },
            required: ['clarity', 'endingStrength', 'anchorStrength', 'ambiguityRisk', 'novelty', 'likelyDifficulty', 'recommendedDecision', 'shortReason']
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
