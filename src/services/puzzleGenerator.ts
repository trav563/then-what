import { GoogleGenAI, Type } from "@google/genai";
import { GenerationSettings, PuzzleRecord, CardData } from "../types";
import { getPuzzles } from "./db";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function generatePuzzles(settings: GenerationSettings): Promise<PuzzleRecord[]> {
  const existingPuzzles = getPuzzles();
  const existingTitles = existingPuzzles.map(p => p.title);
  
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

Avoid these existing puzzle titles:
${existingTitles.slice(0, 100).join(', ')}

For each puzzle, provide:
- title: A short, catchy title
- theme: The general category (e.g., "office chaos")
- cards: An array of exactly 6 strings, representing the story in the CORRECT chronological order.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            theme: { type: Type.STRING },
            cards: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 6 strings in correct chronological order"
            }
          },
          required: ["title", "theme", "cards"]
        }
      }
    }
  });

  const jsonStr = response.text?.trim() || "[]";
  const rawPuzzles = JSON.parse(jsonStr) as { title: string, theme: string, cards: string[] }[];
  
  const now = Date.now();
  const generatedRecords: PuzzleRecord[] = rawPuzzles.map((raw, index) => {
    // Ensure exactly 6 cards
    const safeCards = raw.cards.slice(0, 6);
    while (safeCards.length < 6) {
      safeCards.push("...");
    }

    const cards: CardData[] = safeCards.map((text, i) => ({
      id: `c${i}`,
      text
    }));
    
    // Check for similarity (basic check)
    let similarityWarning = undefined;
    if (existingTitles.some(t => t.toLowerCase() === raw.title.toLowerCase())) {
      similarityWarning = "Exact title match with existing puzzle.";
    } else {
      const sameThemeCount = existingPuzzles.filter(p => p.theme.toLowerCase() === raw.theme.toLowerCase()).length;
      if (sameThemeCount > 10) {
        similarityWarning = `Theme '${raw.theme}' is heavily used (${sameThemeCount} existing).`;
      }
    }

    return {
      id: `gen_${now}_${index}`,
      title: raw.title,
      theme: raw.theme,
      cards,
      correctOrder: cards.map(c => c.id),
      status: 'draft',
      source: 'ai_generation',
      createdAt: now,
      updatedAt: now,
      similarityWarning
    };
  });

  return generatedRecords;
}
