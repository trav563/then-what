import { callAiFunction } from './supabase';
import { GenerationSettings, PuzzleRecord, CardData } from '../types';

export async function generatePuzzles(settings: GenerationSettings): Promise<PuzzleRecord[]> {
  const rawPuzzles = await callAiFunction('generate', { settings });

  const now = Date.now();
  const generatedRecords: PuzzleRecord[] = rawPuzzles.map((raw: any, index: number) => {
    // Ensure exactly 6 cards
    const safeCards = (raw.cards || []).slice(0, 6);
    while (safeCards.length < 6) {
      safeCards.push("...");
    }

    const cards: CardData[] = safeCards.map((text: string, i: number) => ({
      id: `c${i}`,
      text
    }));

    return {
      id: `gen_${now}_${index}`,
      title: raw.title,
      theme: raw.theme,
      cards,
      correctOrder: cards.map(c => c.id),
      status: 'draft' as const,
      source: 'ai_generation',
      createdAt: now,
      updatedAt: now,
      similarityWarning: undefined
    };
  });

  return generatedRecords;
}
