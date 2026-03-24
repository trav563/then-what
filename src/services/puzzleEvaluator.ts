import { callAiFunction } from './supabase';
import { Puzzle, PuzzleEvaluation } from '../types';

export async function evaluatePuzzle(puzzle: Puzzle): Promise<PuzzleEvaluation> {
  const result = await callAiFunction('evaluate', { puzzle });
  return result as PuzzleEvaluation;
}
