import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Public API (no auth required, RLS enforced) ───

export interface TodayPuzzleResponse {
  id: string;
  number: number;
  title: string;
  theme: string;
  flavor_text?: string;
  cards: { id: string; text: string }[];
  correct_order: string[];
}

/**
 * Fetches today's puzzle via the secure RPC function.
 * Passes the user's LOCAL date to avoid UTC timezone issues.
 * Returns null if no puzzle is scheduled for today.
 */
export async function fetchTodayPuzzle(): Promise<TodayPuzzleResponse | null> {
  // Compute the user's local date string (YYYY-MM-DD) to avoid UTC mismatch
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
    .toISOString().split('T')[0];

  const { data, error } = await supabase.rpc('get_today_puzzle', { target_date: localDate });

  if (error) {
    console.error('Error fetching today\'s puzzle:', error);
    return null;
  }

  return data as TodayPuzzleResponse | null;
}

// ─── Admin API (requires authenticated session) ───

export async function fetchAllPuzzles() {
  const { data, error } = await supabase
    .from('puzzles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching puzzles:', error);
    return [];
  }
  return data;
}

export async function fetchSchedule() {
  const { data, error } = await supabase
    .from('schedule')
    .select('*')
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching schedule:', error);
    return {};
  }

  // Convert array to Record<string, string> for compatibility
  const scheduleMap: Record<string, string> = {};
  (data || []).forEach((row: { date: string; puzzle_id: string }) => {
    scheduleMap[row.date] = row.puzzle_id;
  });
  return scheduleMap;
}

export async function upsertPuzzle(puzzle: Record<string, any>) {
  const { error } = await supabase
    .from('puzzles')
    .upsert(puzzle, { onConflict: 'id' });

  if (error) {
    console.error('Error saving puzzle:', error);
    throw error;
  }
}

export async function upsertScheduleEntry(date: string, puzzleId: string) {
  const { error } = await supabase
    .from('schedule')
    .upsert({ date, puzzle_id: puzzleId }, { onConflict: 'date' });

  if (error) {
    console.error('Error saving schedule entry:', error);
    throw error;
  }
}

export async function deleteScheduleEntry(date: string) {
  const { error } = await supabase
    .from('schedule')
    .delete()
    .eq('date', date);

  if (error) {
    console.error('Error deleting schedule entry:', error);
    throw error;
  }
}

// ─── Batches API (admin only) ───

export async function fetchBatches() {
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching batches:', error);
    return [];
  }
  return (data || []).map(mapBatchFromDb);
}

export async function upsertBatch(batch: any) {
  const dbBatch = {
    id: batch.id,
    created_at: batch.createdAt,
    settings: batch.settings,
    puzzle_ids: batch.puzzleIds,
    status: batch.status,
    summary: batch.summary || null,
  };

  const { error } = await supabase
    .from('batches')
    .upsert(dbBatch, { onConflict: 'id' });

  if (error) {
    console.error('Error saving batch:', error);
    throw error;
  }
}

function mapBatchFromDb(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    settings: row.settings,
    puzzleIds: row.puzzle_ids,
    status: row.status,
    summary: row.summary,
  };
}

// ─── Automation Settings API (admin only) ───

export async function fetchAutomationSettings() {
  const { data, error } = await supabase
    .from('automation_settings')
    .select('*')
    .eq('id', 'default')
    .single();

  if (error || !data) {
    return { enabled: false, threshold: 14, batchSize: 20 };
  }

  return {
    enabled: data.enabled,
    threshold: data.threshold,
    batchSize: data.batch_size,
    themeMix: data.theme_mix || undefined,
    instructionEmphasis: data.instruction_emphasis || undefined,
    excludeThemes: data.exclude_themes || undefined,
  };
}

export async function saveAutomationSettingsRemote(settings: any) {
  const dbSettings = {
    id: 'default',
    enabled: settings.enabled,
    threshold: settings.threshold,
    batch_size: settings.batchSize,
    theme_mix: settings.themeMix || null,
    instruction_emphasis: settings.instructionEmphasis || null,
    exclude_themes: settings.excludeThemes || null,
  };

  const { error } = await supabase
    .from('automation_settings')
    .upsert(dbSettings, { onConflict: 'id' });

  if (error) {
    console.error('Error saving automation settings:', error);
    throw error;
  }
}

// ─── Puzzle Helpers ───

/** Convert a PuzzleRecord to the Supabase DB format */
export function puzzleToDbFormat(puzzle: any) {
  return {
    id: puzzle.id,
    number: puzzle.number || null,
    title: puzzle.title,
    theme: puzzle.theme,
    cards: puzzle.cards,
    correct_order: puzzle.correctOrder,
    status: puzzle.status,
    scheduled_for: puzzle.scheduledFor || null,
    evaluation: puzzle.evaluation || null,
    source: puzzle.source || null,
    notes: puzzle.notes || null,
    generation_batch_id: puzzle.generationBatchId || null,
    similarity_warning: puzzle.similarityWarning || null,
    is_auto_recommended: puzzle.isAutoRecommended || false,
    created_at: puzzle.createdAt ? new Date(puzzle.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_at: puzzle.approvedAt ? new Date(puzzle.approvedAt).toISOString() : null,
    published_at: puzzle.publishedAt ? new Date(puzzle.publishedAt).toISOString() : null,
    retired_at: puzzle.retiredAt ? new Date(puzzle.retiredAt).toISOString() : null,
    rejected_at: puzzle.rejectedAt ? new Date(puzzle.rejectedAt).toISOString() : null,
  };
}

/** Convert a Supabase DB row to the frontend PuzzleRecord format */
export function puzzleFromDbFormat(row: any) {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    theme: row.theme,
    cards: row.cards,
    correctOrder: row.correct_order,
    status: row.status,
    scheduledFor: row.scheduled_for,
    evaluation: row.evaluation,
    source: row.source,
    notes: row.notes,
    generationBatchId: row.generation_batch_id,
    similarityWarning: row.similarity_warning,
    isAutoRecommended: row.is_auto_recommended,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    approvedAt: row.approved_at ? new Date(row.approved_at).getTime() : undefined,
    publishedAt: row.published_at ? new Date(row.published_at).getTime() : undefined,
    retiredAt: row.retired_at ? new Date(row.retired_at).getTime() : undefined,
    rejectedAt: row.rejected_at ? new Date(row.rejected_at).getTime() : undefined,
  };
}

/** Fetch all puzzles and map to frontend format */
export async function fetchAllPuzzlesMapped() {
  const rows = await fetchAllPuzzles();
  return rows.map(puzzleFromDbFormat);
}

/** Upsert a puzzle using the frontend PuzzleRecord format */
export async function upsertPuzzleMapped(puzzle: any) {
  return upsertPuzzle(puzzleToDbFormat(puzzle));
}

// ─── Secure AI API ───

export async function callAiFunction(action: 'generate' | 'evaluate', payload: any) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `AI request failed: ${response.status}`);
  }

  return response.json();
}

// ─── Auth Helpers ───

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function onAuthStateChange(callback: (session: any) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
