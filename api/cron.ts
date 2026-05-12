import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { runGenerate, runEvaluate, ExistingPuzzleHint } from './ai';
import { checkSimilarity, ExistingPuzzleSummary } from '../src/services/similarity';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (!CRON_SECRET || !authHeader || authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase env not configured' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const { data: settingsRow } = await supabase
      .from('automation_settings')
      .select('*')
      .eq('id', 'default')
      .single();

    const settings = settingsRow
      ? {
          enabled: settingsRow.enabled,
          threshold: settingsRow.threshold,
          batchSize: settingsRow.batch_size,
          themeMix: settingsRow.theme_mix || undefined,
          instructionEmphasis: settingsRow.instruction_emphasis || undefined,
          excludeThemes: settingsRow.exclude_themes || undefined,
        }
      : { enabled: false, threshold: 14, batchSize: 20 };

    if (!settings.enabled) {
      return res.status(200).json({ skipped: 'automation disabled' });
    }

    const { data: puzzlesRows } = await supabase.from('puzzles').select('*');
    const { data: scheduleRows } = await supabase.from('schedule').select('*');
    const puzzles = (puzzlesRows || []).map(rowToPuzzle);
    const scheduleMap: Record<string, string> = {};
    (scheduleRows || []).forEach((r: any) => { scheduleMap[r.date] = r.puzzle_id; });

    const scheduledIds = new Set(Object.values(scheduleMap));
    const approvedUnscheduled = puzzles.filter((p: any) => p.status === 'approved' && !scheduledIds.has(p.id));

    if (approvedUnscheduled.length >= settings.threshold) {
      return res.status(200).json({
        skipped: 'inventory healthy',
        approvedUnscheduled: approvedUnscheduled.length,
        threshold: settings.threshold,
      });
    }

    const { data: batchesRows } = await supabase
      .from('batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    const inFlight = (batchesRows || []).find((b: any) => b.status === 'generating' || b.status === 'evaluating');
    if (inFlight) {
      return res.status(200).json({ skipped: 'batch already in flight', batchId: inFlight.id });
    }

    const existingHints: ExistingPuzzleHint[] = puzzles.map((p: any) => ({
      title: p.title,
      theme: p.theme,
      isTrueStory: p.isTrueStory,
    }));
    const existingSummaries: ExistingPuzzleSummary[] = puzzles.map((p: any) => ({
      id: p.id,
      title: p.title,
      theme: p.theme,
      isTrueStory: p.isTrueStory,
      funFact: p.funFact,
      firstCardText: p.cards?.[0]?.text,
    }));

    const rawPuzzles = await runGenerate(
      {
        count: settings.batchSize,
        themeMix: settings.themeMix,
        instructionEmphasis: settings.instructionEmphasis,
        excludeThemes: settings.excludeThemes,
      },
      existingHints
    );

    const now = Date.now();
    const batchId = `cronbatch_${now}`;

    const candidates = rawPuzzles.map((raw: any, index: number) => {
      const safeCards = (raw.cards || []).slice(0, 6);
      while (safeCards.length < 6) safeCards.push('...');
      const cards = safeCards.map((text: string, i: number) => ({ id: `c${i}`, text }));

      const sim = checkSimilarity(
        {
          title: raw.title,
          theme: raw.theme,
          isTrueStory: raw.is_true_story,
          funFact: raw.fun_fact,
          firstCardText: cards[0]?.text,
        },
        existingSummaries
      );

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
        similarityWarning: sim.warning || undefined,
        storyText: raw.story_text || undefined,
        isTrueStory: raw.is_true_story || false,
        funFact: raw.fun_fact || undefined,
        generationBatchId: batchId,
      };
    });

    await supabase.from('batches').upsert({
      id: batchId,
      created_at: now,
      settings: {
        count: settings.batchSize,
        themeMix: settings.themeMix,
        instructionEmphasis: settings.instructionEmphasis,
        excludeThemes: settings.excludeThemes,
      },
      puzzle_ids: candidates.map((p: any) => p.id),
      status: 'evaluating',
      summary: null,
    });

    for (const c of candidates) {
      await supabase.from('puzzles').upsert(puzzleToDb(c));
    }

    const autoApproved: any[] = [];
    for (const c of candidates) {
      try {
        const evaluation = await runEvaluate({
          title: c.title,
          theme: c.theme,
          cards: c.cards,
          correctOrder: c.correctOrder,
          isTrueStory: c.isTrueStory,
          funFact: c.funFact,
        });
        (c as any).evaluation = evaluation;
        c.status = 'ai_reviewed' as any;

        const isAutoRecommended =
          evaluation.clarity >= 9 &&
          evaluation.endingStrength >= 8 &&
          evaluation.anchorStrength >= 8 &&
          evaluation.ambiguityRisk <= 2 &&
          evaluation.novelty >= 6 &&
          !c.similarityWarning;

        (c as any).isAutoRecommended = isAutoRecommended;

        if (isAutoRecommended) {
          c.status = 'approved' as any;
          (c as any).approvedAt = Date.now();
          autoApproved.push(c);
        }

        await supabase.from('puzzles').upsert(puzzleToDb(c));
      } catch (e) {
        console.error('Eval failed for', c.id, e);
      }
    }

    let scheduledCount = 0;
    if (autoApproved.length > 0) {
      const scheduledDates = new Set(Object.keys(scheduleMap));
      const cursor = new Date();
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const queue = [...autoApproved];
      let safety = 0;
      while (queue.length > 0 && safety < 365) {
        const dateStr = cursor.toISOString().split('T')[0];
        if (!scheduledDates.has(dateStr)) {
          const puzzle = queue.shift();
          if (puzzle) {
            await supabase.from('schedule').upsert({ date: dateStr, puzzle_id: puzzle.id }, { onConflict: 'date' });
            puzzle.status = 'scheduled' as any;
            (puzzle as any).scheduledFor = dateStr;
            await supabase.from('puzzles').upsert(puzzleToDb(puzzle));
            scheduledDates.add(dateStr);
            scheduledCount++;
          }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        safety++;
      }
    }

    await supabase.from('batches').upsert({
      id: batchId,
      created_at: now,
      settings: {
        count: settings.batchSize,
        themeMix: settings.themeMix,
        instructionEmphasis: settings.instructionEmphasis,
        excludeThemes: settings.excludeThemes,
      },
      puzzle_ids: candidates.map((p: any) => p.id),
      status: 'completed',
      summary: {
        generated: candidates.length,
        autoApproved: autoApproved.length,
        autoScheduled: scheduledCount,
        flaggedDuplicates: candidates.filter((p: any) => p.similarityWarning).length,
      },
    });

    return res.status(200).json({
      generated: candidates.length,
      approved: autoApproved.length,
      scheduled: scheduledCount,
      duplicatesFlagged: candidates.filter((p: any) => p.similarityWarning).length,
      batchId,
    });
  } catch (error: any) {
    console.error('Cron failed:', error);
    return res.status(500).json({ error: error.message || 'Cron failed' });
  }
}

function rowToPuzzle(row: any) {
  return {
    id: row.id,
    title: row.title,
    theme: row.theme,
    cards: row.cards,
    correctOrder: row.correct_order,
    status: row.status,
    isTrueStory: !!row.is_true_story,
    funFact: row.fun_fact || undefined,
  };
}

function puzzleToDb(p: any) {
  return {
    id: p.id,
    title: p.title,
    theme: p.theme,
    cards: p.cards,
    correct_order: p.correctOrder,
    status: p.status,
    scheduled_for: p.scheduledFor || null,
    evaluation: p.evaluation || null,
    source: p.source || null,
    generation_batch_id: p.generationBatchId || null,
    similarity_warning: p.similarityWarning || null,
    is_auto_recommended: p.isAutoRecommended || false,
    story_text: p.storyText || null,
    is_true_story: p.isTrueStory || false,
    fun_fact: p.funFact || null,
    created_at: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_at: p.approvedAt ? new Date(p.approvedAt).toISOString() : null,
  };
}
