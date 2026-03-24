import { GoogleGenAI, Type } from "@google/genai";
import { Puzzle, PuzzleEvaluation } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function evaluatePuzzle(puzzle: Puzzle): Promise<PuzzleEvaluation> {
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
${puzzle.correctOrder.map((id, index) => `${index + 1}. ${puzzle.cards.find(c => c.id === id)?.text}`).join('\n')}
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          clarity: { type: Type.NUMBER },
          endingStrength: { type: Type.NUMBER },
          anchorStrength: { type: Type.NUMBER },
          ambiguityRisk: { type: Type.NUMBER },
          novelty: { type: Type.NUMBER },
          likelyDifficulty: { type: Type.STRING, enum: ["easy", "medium", "hard"] },
          recommendedDecision: { type: Type.STRING, enum: ["approve", "revise", "reject"] },
          shortReason: { type: Type.STRING }
        },
        required: ["clarity", "endingStrength", "anchorStrength", "ambiguityRisk", "novelty", "likelyDifficulty", "recommendedDecision", "shortReason"]
      }
    }
  });

  const jsonStr = response.text?.trim() || "{}";
  return JSON.parse(jsonStr) as PuzzleEvaluation;
}
