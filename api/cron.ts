import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { runGenerate, runEvaluate, fetchExistingPuzzles, backfillEmbeddings } from '../src/services/aiCore';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Daily autonomous generation. Mirrors the gates in src/services/automation.ts
// so the cron, the browser automation, and manual Batches all behave identically:
//   GATE 0 — reject duplicates (semantic + lexical, tagged by runGenerate)
//   GATE 1 — reject non-true-stories
//   GATE 2 — reject duplicate/inaccurate/bad-trivia after evaluation
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

    const { data: scheduleRows } = await supabase.from('schedule').select('*');
    const scheduleMap: Record<string, string> = {};
    (scheduleRows || []).forEach((r: any) => { scheduleMap[r.date] = r.puzzle_id; });
    const scheduledIds = new Set(Object.values(scheduleMap));

    // Off-limits history (every status) + embeddings for the semantic check.
    const existing = await fetchExistingPuzzles(supabase);

    const approvedUnscheduled = existing.filter(
      (p) => p.status === 'approved' && !scheduledIds.has(p.id)
    );
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
    const inFlight = (batchesRows || []).find(
      (b: any) => b.status === 'generating' || b.status === 'evaluating'
    );
    if (inFlight) {
      return res.status(200).json({ skipped: 'batch already in flight', batchId: inFlight.id });
    }

    await backfillEmbeddings(supabase, existing);

    const rawPuzzles = await runGenerate(
      {
        count: settings.batchSize,
        themeMix: settings.themeMix,
        instructionEmphasis: settings.instructionEmphasis,
        excludeThemes: settings.excludeThemes,
      },
      existing
    );

    const now = Date.now();
    const batchId = `cronbatch_${now}`;

    const candidates = rawPuzzles.map((raw: any, index: number) => {
      const safeCards = (raw.cards || []).slice(0, 6).map((c: any) => String(c));
      while (safeCards.length < 6) safeCards.push('...');
      const cards = safeCards.map((text: string, i: number) => ({ id: `c${i}`, text }));
      return {
        id: `gen_${now}_${index}`,
        title: raw.title,
        theme: raw.theme,
        cards,
        correctOrder: cards.map((c: any) => c.id),
        status: 'draft' as string,
        source: 'ai_generation',
        createdAt: now,
        updatedAt: now,
        isDuplicate: !!raw.is_duplicate,
        similarityWarning: raw.similarity_warning || undefined,
        storyText: raw.story_text || undefined,
        isTrueStory: raw.is_true_story || false,
        funFact: raw.fun_fact || undefined,
        embedding: Array.isArray(raw.embedding) ? raw.embedding : undefined,
        evaluation: undefined as any,
        isAutoRecommended: false,
        approvedAt: undefined as number | undefined,
        scheduledFor: undefined as string | undefined,
        rejectedAt: undefined as number | undefined,
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
      puzzle_ids: candidates.map((p) => p.id),
      status: 'evaluating',
      summary: null,
    });

    for (const c of candidates) {
      await supabase.from('puzzles').upsert(puzzleToDb(c));
    }

    const autoApproved: typeof candidates = [];
    for (const c of candidates) {
      try {
        // GATE 0 — duplicate of a past or in-batch puzzle.
        if (c.isDuplicate) {
          c.status = 'rejected';
          c.rejectedAt = Date.now();
          if (!c.similarityWarning) c.similarityWarning = '🔁 REJECTED: Duplicate of an existing puzzle.';
          await supabase.from('puzzles').upsert(puzzleToDb(c));
          continue;
        }

        // GATE 1 — must be a verified true story.
        if (!c.isTrueStory) {
          c.status = 'rejected';
          c.rejectedAt = Date.now();
          c.similarityWarning = '❌ REJECTED: Not a verified true story. All puzzles must be Bizarre True Stories.';
          await supabase.from('puzzles').upsert(puzzleToDb(c));
          continue;
        }

        const evaluation = await runEvaluate({
          title: c.title,
          theme: c.theme,
          cards: c.cards,
          correctOrder: c.correctOrder,
          isTrueStory: c.isTrueStory,
          funFact: c.funFact,
        }, existing);
        c.evaluation = evaluation;

        if (evaluation.duplicateOfExisting && evaluation.similarityFlag) {
          c.similarityWarning = `🔁 DUPLICATE: ${evaluation.similarityFlag}`;
        }

        const factAccuracy = evaluation.fact_accuracy ?? 10;
        const triviaQuality = evaluation.true_story_trivia_quality ?? 10;

        // GATE 2 — post-evaluation rejections.
        if (evaluation.duplicateOfExisting) {
          c.status = 'rejected';
          c.rejectedAt = Date.now();
        } else if (factAccuracy < 7) {
          c.status = 'rejected';
          c.rejectedAt = Date.now();
          c.similarityWarning = `❌ FACT-CHECK FAILED: AI evaluator scored fact accuracy ${factAccuracy}/10. Story may not be true.`;
        } else if (triviaQuality < 4) {
          c.status = 'rejected';
          c.rejectedAt = Date.now();
          c.similarityWarning = `⚠️ BAD TRIVIA: Fun fact scored ${triviaQuality}/10 — generic trivia instead of event epilogue.`;
        } else {
          c.status = 'ai_reviewed';
        }

        const isAutoRecommended =
          evaluation.clarity >= 9 &&
          evaluation.endingStrength >= 8 &&
          evaluation.anchorStrength >= 8 &&
          evaluation.ambiguityRisk <= 2 &&
          evaluation.novelty >= 6 &&
          factAccuracy >= 8 &&
          triviaQuality >= 6 &&
          !c.similarityWarning &&
          !evaluation.duplicateOfExisting;

        c.isAutoRecommended = isAutoRecommended;

        if (isAutoRecommended) {
          c.status = 'approved';
          c.approvedAt = Date.now();
          autoApproved.push(c);
        }

        await supabase.from('puzzles').upsert(puzzleToDb(c));
      } catch (e) {
        console.error('Eval failed for', c.id, e);
      }
    }

    // Auto-schedule approved puzzles onto the next free future dates.
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
            puzzle.status = 'scheduled';
            puzzle.scheduledFor = dateStr;
            await supabase.from('puzzles').upsert(puzzleToDb(puzzle));
            scheduledDates.add(dateStr);
            scheduledCount++;
          }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        safety++;
      }
    }

    const rejectedCount = candidates.filter((p) => p.status === 'rejected').length;

    await supabase.from('batches').upsert({
      id: batchId,
      created_at: now,
      settings: {
        count: settings.batchSize,
        themeMix: settings.themeMix,
        instructionEmphasis: settings.instructionEmphasis,
        excludeThemes: settings.excludeThemes,
      },
      puzzle_ids: candidates.map((p) => p.id),
      status: 'completed',
      summary: {
        generated: candidates.length,
        autoApproved: autoApproved.length,
        autoScheduled: scheduledCount,
        rejected: rejectedCount,
      },
    });

    return res.status(200).json({
      generated: candidates.length,
      approved: autoApproved.length,
      scheduled: scheduledCount,
      rejected: rejectedCount,
      batchId,
    });
  } catch (error: any) {
    console.error('Cron failed:', error);
    return res.status(500).json({ error: error.message || 'Cron failed' });
  }
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
    embedding: p.embedding || null,
    created_at: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_at: p.approvedAt ? new Date(p.approvedAt).toISOString() : null,
    rejected_at: p.rejectedAt ? new Date(p.rejectedAt).toISOString() : null,
  };
}
