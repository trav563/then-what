import { callAiFunction } from './supabase';
import { GenerationSettings, PuzzleRecord, CardData } from '../types';

export async function generatePuzzles(settings: GenerationSettings): Promise<PuzzleRecord[]> {
  // Dedup (semantic + lexical, against the full history and within the batch)
  // runs server-side in /api/ai so EVERY path — manual Batches and automation —
  // is covered uniformly. The server tags each puzzle with is_duplicate.
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
      isDuplicate: !!raw.is_duplicate,
      similarityWarning: raw.similarity_warning || undefined,
      storyText: raw.story_text || undefined,
      isTrueStory: raw.is_true_story || false,
      funFact: raw.fun_fact || undefined,
      embedding: Array.isArray(raw.embedding) ? raw.embedding : undefined,
    };
  });

  return generatedRecords;
}
