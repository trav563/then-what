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
The game presents players with 6 sentences out of order. The player must arrange them into the correct chronological sequence.

Generate a batch of ${settings.count} new puzzles. 
CRITICAL RULE: Roughly half of your puzzles MUST be "Bizarre True Stories" and the other half MUST be "Fictional Mishaps". 

FORMAT 1: Fictional Mishaps
- A funny, cause-and-effect driven fictional story (e.g., social mishaps, office chaos).
- Provide exactly 6 chronological cards (5-12 words each).
- Provide 'story_text' that politely stitches the cards.
- Set 'is_true_story' to false.
- REQUIRED: Provide a 'fun_fact' that is a TRUE, verified, highly interesting piece of trivia closely related to the theme of the fictional story. (e.g., if the story is about dropping an AirPod, the fun fact could be about the history of Bluetooth).

FORMAT 2: Bizarre True Stories
- A true, verified, bizarre, hilarious or fascinating historical event/phenomenon told as a micro-story (e.g., The Great Emu War, the first cat in space).
- Provide exactly 6 chronological cards.
- Provide 'story_text' that politely stitches the cards.
- Set 'is_true_story' to true.
- REQUIRED: The 'fun_fact' MUST be an Epilogue or additional historical context about the actual event itself (e.g., what happened next, the consequences, or the bizarre aftermath). DO NOT provide generic encyclopedia trivia! (e.g., If the story is about Napoleon fighting rabbits, do NOT provide biological facts about rabbits. Provide a historical fact about the aftermath of the specific event).

Content Rules for BOTH:
- Exactly 6 cards per puzzle.
- Short, concrete, mobile-readable cards.
- Clear cause-and-effect sequence with no ambiguous middles.
- Avoid vague emotional states, focus on action.

${settings.themeMix ? `Theme targeting: ${settings.themeMix}` : ''}
${settings.instructionEmphasis ? `Instruction emphasis: ${settings.instructionEmphasis}` : ''}
${settings.excludeThemes ? `Exclude/reduce these themes: ${settings.excludeThemes}` : ''}

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

async function evaluatePuzzle(puzzle: { title: string; theme: string; cards: { id: string; text: string }[]; correctOrder: string[]; isTrueStory?: boolean; funFact?: string; }) {
  const cardsInOrder = puzzle.correctOrder.map((id, index) => {
    const card = puzzle.cards.find((c: any) => c.id === id);
    return `${index + 1}. ${card?.text || '???'}`;
  }).join('\n');

  const prompt = `
You are an expert puzzle designer and playtester for a narrative sequencing game.
The game presents players with 6 sentences out of order. The player must arrange them into the correct chronological sequence.

Evaluate the following candidate puzzle based on these criteria:
- clarity (1-10): How clear is the sequence of events? Is there only one logical order?
- chronology_logic (1-10): Are the events physically and temporally possible? (e.g. jumping out of a plane AFTER landing is impossible).
- ending strength (1-10): Does the final card provide a satisfying punchline or resolution?
- anchor strength (1-10): Are there clear "first" and "last" cards that players can easily identify to anchor their solving process?
- ambiguity risk (1-10): How likely is it that players will validly argue for an alternate order? (1 = very low risk, 10 = very high risk)
- novelty (1-10): Does this feel fresh compared to typical tropes?
- fact_accuracy (1-10): If this is a True Story or has a Fun Fact, is it 100% factually accurate, or did the AI hallucinate it? (1 = totally made up, 10 = verified true. If N/A, put 10).
- true_story_trivia_quality (1-10): If this is a True Story, the fun_fact MUST be an epilogue or specific historical context about the actual event, NOT a generic fact about the topic. (If it's generic trivia for a true story, score it 1).
- likely difficulty: "easy", "medium", or "hard"

Then provide a recommended decision ("approve", "revise", or "reject") and a short reason (1-2 sentences).
CRITICAL FACT-CHECKING & LOGIC RULE: If 'is_true_story' is true, and the event didn't actually happen, you MUST reject it. If 'fun_fact' is provided and is false or inaccurate, you MUST reject it. If the chronological sequence contains physical impossibilities or time paradoxes, you MUST reject it. If 'true_story_trivia_quality' is low because it generated generic Wikipedia trivia for a True event, you MUST reject it and demand an epilogue instead.

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
              likelyDifficulty: { type: 'STRING' },
              recommendedDecision: { type: 'STRING' },
              shortReason: { type: 'STRING' }
            },
            required: ['clarity', 'chronology_logic', 'endingStrength', 'anchorStrength', 'ambiguityRisk', 'novelty', 'true_story_trivia_quality', 'likelyDifficulty', 'recommendedDecision', 'shortReason']
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
