import { callAiFunction, fetchAllPuzzlesMapped } from './supabase';
import { GenerationSettings, PuzzleRecord, CardData } from '../types';

export async function generatePuzzles(settings: GenerationSettings): Promise<PuzzleRecord[]> {
  const rawPuzzles = await callAiFunction('generate', { settings });

  // Fetch existing puzzle titles for client-side dedup safety net
  let existingTitles: string[] = [];
  try {
    const existingPuzzles = await fetchAllPuzzlesMapped();
    existingTitles = (existingPuzzles as PuzzleRecord[])
      .filter(p => p.status !== 'rejected')
      .map(p => p.title.toLowerCase().trim());
  } catch (e) {
    console.warn('Could not fetch existing puzzles for dedup check:', e);
  }

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

    // Client-side duplicate title check (safety net)
    const newTitleLower = (raw.title || '').toLowerCase().trim();
    let similarityWarning: string | undefined;
    if (existingTitles.includes(newTitleLower)) {
      similarityWarning = `⚠️ DUPLICATE TITLE: "${raw.title}" already exists in the database. This puzzle should be rejected.`;
    }

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
      similarityWarning,
      storyText: raw.story_text || undefined,
      isTrueStory: raw.is_true_story || false,
      funFact: raw.fun_fact || undefined,
    };
  });

  return generatedRecords;
}
