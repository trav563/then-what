import { getPuzzles, getSchedule, getAutomationSettings, saveBatch, savePuzzle, getBatches } from './db';
import { generatePuzzles } from './puzzleGenerator';
import { evaluatePuzzle } from './puzzleEvaluator';
import { GenerationBatch, GenerationSettings, PuzzleRecord } from '../types';

export async function checkAndRunAutomation(onProgress?: (msg: string) => void, force: boolean = false): Promise<boolean> {
  const settings = getAutomationSettings();
  
  const puzzles = getPuzzles();
  const schedule = getSchedule();
  
  // Calculate approved but unscheduled puzzles
  const scheduledPuzzleIds = new Set(Object.values(schedule));
  const approvedUnscheduled = puzzles.filter(p => p.status === 'approved' && !scheduledPuzzleIds.has(p.id));
  
  const isBelowThreshold = approvedUnscheduled.length < settings.threshold;
  
  if (!settings.enabled || !isBelowThreshold) {
    if (!force) return false; // No automation needed or enabled
  }

  // Check if there is already a batch generating
  const batches = getBatches();
  const isGenerating = batches.some(b => b.status === 'generating' || b.status === 'evaluating');
  if (isGenerating) {
    if (onProgress) onProgress('A generation is already in progress.');
    return false; // Already running
  }

  // Cooldown check: 1 hour
  if (!force && batches.length > 0) {
    const latestBatch = batches[0];
    const timeSinceLastRun = Date.now() - latestBatch.createdAt;
    const cooldownMs = 60 * 60 * 1000; // 1 hour
    if (timeSinceLastRun < cooldownMs) {
      if (onProgress) onProgress('Cooldown active. Skipping auto-generation.');
      return false;
    }
  }

  if (onProgress) onProgress('Starting auto-generation...');

  try {
    const genSettings: GenerationSettings = {
      count: settings.batchSize,
      themeMix: settings.themeMix,
      instructionEmphasis: settings.instructionEmphasis,
      excludeThemes: settings.excludeThemes
    };

    if (onProgress) onProgress('Generating puzzles...');
    const newPuzzles = await generatePuzzles(genSettings);
    
    const batchId = `autobatch_${Date.now()}`;
    const puzzleIds = newPuzzles.map(p => p.id);
    
    const newBatch: GenerationBatch = {
      id: batchId,
      createdAt: Date.now(),
      settings: genSettings,
      puzzleIds,
      status: 'evaluating'
    };

    // Save draft puzzles
    newPuzzles.forEach(p => {
      p.generationBatchId = batchId;
      savePuzzle(p);
    });
    
    saveBatch(newBatch);

    // Evaluate puzzles
    let evaluatedCount = 0;
    for (const puzzle of newPuzzles) {
      if (onProgress) onProgress(`Evaluating puzzle ${evaluatedCount + 1} of ${newPuzzles.length}...`);
      try {
        const evaluation = await evaluatePuzzle(puzzle);
        puzzle.evaluation = evaluation;
        puzzle.status = 'ai_reviewed';
        
        // Auto-recommendation logic
        const isAutoRecommended = 
          evaluation.clarity >= 9 &&
          evaluation.endingStrength >= 8 &&
          evaluation.anchorStrength >= 8 &&
          evaluation.ambiguityRisk <= 2 &&
          evaluation.novelty >= 6 &&
          !puzzle.similarityWarning;
          
        puzzle.isAutoRecommended = isAutoRecommended;
        
        savePuzzle(puzzle);
      } catch (e) {
        console.error("Failed to evaluate puzzle", puzzle.id, e);
      }
      evaluatedCount++;
    }

    // Update batch status
    newBatch.status = 'completed';
    
    // Calculate summary
    const updatedPuzzles = getPuzzles().filter(p => puzzleIds.includes(p.id));
    const validEvals = updatedPuzzles.filter(p => p.evaluation);
    
    if (validEvals.length > 0) {
      const avgEnding = validEvals.reduce((sum, p) => sum + (p.evaluation?.endingStrength || 0), 0) / validEvals.length;
      const avgAmbiguity = validEvals.reduce((sum, p) => sum + (p.evaluation?.ambiguityRisk || 0), 0) / validEvals.length;
      
      const themes: Record<string, number> = {};
      updatedPuzzles.forEach(p => {
        themes[p.theme] = (themes[p.theme] || 0) + 1;
      });

      const sortedByScore = [...validEvals].sort((a, b) => {
        const scoreA = (a.evaluation?.clarity || 0) + (a.evaluation?.endingStrength || 0) - (a.evaluation?.ambiguityRisk || 0);
        const scoreB = (b.evaluation?.clarity || 0) + (b.evaluation?.endingStrength || 0) - (b.evaluation?.ambiguityRisk || 0);
        return scoreB - scoreA;
      });

      newBatch.summary = {
        strongestCandidates: sortedByScore.slice(0, 3).map(p => p.id),
        weakestCandidates: sortedByScore.slice(-3).map(p => p.id),
        themeDistribution: themes,
        averageEndingStrength: avgEnding,
        averageAmbiguityRisk: avgAmbiguity
      };
    }

    saveBatch(newBatch);
    if (onProgress) onProgress('Auto-generation complete.');
    return true;
  } catch (error) {
    console.error('Automation failed:', error);
    if (onProgress) onProgress('Automation failed.');
    return false;
  }
}

export function getInventoryHealth() {
  const puzzles = getPuzzles();
  const schedule = getSchedule();
  
  const scheduledPuzzleIds = new Set(Object.values(schedule));
  
  const approved = puzzles.filter(p => p.status === 'approved');
  const approvedUnscheduled = approved.filter(p => !scheduledPuzzleIds.has(p.id));
  const scheduled = puzzles.filter(p => scheduledPuzzleIds.has(p.id) || p.status === 'scheduled');
  const aiReviewed = puzzles.filter(p => p.status === 'ai_reviewed');
  const published = puzzles.filter(p => p.status === 'published');
  
  // Calculate days scheduled ahead
  const today = new Date();
  const dateString = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  
  let daysScheduledAhead = 0;
  const scheduleDates = Object.keys(schedule).sort();
  for (const date of scheduleDates) {
    if (date >= dateString) {
      daysScheduledAhead++;
    }
  }

  return {
    approvedTotal: approved.length,
    approvedUnscheduled: approvedUnscheduled.length,
    scheduled: scheduled.length,
    aiReviewed: aiReviewed.length,
    published: published.length,
    daysScheduledAhead
  };
}
