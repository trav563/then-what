import { callAiFunction } from './supabase';
import { GenerationSettings, PuzzleRecord, CardData } from '../types';
import { checkSimilarity, ExistingPuzzleSummary } from './similarity';

export async function generatePuzzles(
  settings: GenerationSettings,
  existingPuzzles: ExistingPuzzleSummary[] = []
): Promise<PuzzleRecord[]> {
  const promptHints = existingPuzzles.map(p => ({
    title: p.title,
    theme: p.theme,
    isTrueStory: p.isTrueStory,
  }));

  const rawPuzzles = await callAiFunction('generate', {
    settings,
    existingPuzzles: promptHints,
  });

  const now = Date.now();
  const generatedRecords: PuzzleRecord[] = rawPuzzles.map((raw: any, index: number) => {
    const safeCards = (raw.cards || []).slice(0, 6);
    while (safeCards.length < 6) {
      safeCards.push("...");
    }

    const cards: CardData[] = safeCards.map((text: string, i: number) => ({
      id: `c${i}`,
      text
    }));

    const candidateRecord: PuzzleRecord = {
      id: `gen_${now}_${index}`,
      title: raw.title,
      theme: raw.theme,
      cards,
      correctOrder: cards.map(c => c.id),
      status: 'draft' as const,
      source: 'ai_generation',
      createdAt: now,
      updatedAt: now,
      similarityWarning: undefined,
      storyText: raw.story_text || undefined,
      isTrueStory: raw.is_true_story || false,
      funFact: raw.fun_fact || undefined,
    };

    const sim = checkSimilarity(
      {
        title: candidateRecord.title,
        theme: candidateRecord.theme,
        isTrueStory: candidateRecord.isTrueStory,
        funFact: candidateRecord.funFact,
        firstCardText: candidateRecord.cards[0]?.text,
      },
      existingPuzzles
    );

    if (sim.warning) {
      candidateRecord.similarityWarning = sim.warning;
    }

    return candidateRecord;
  });

  return generatedRecords;
}
