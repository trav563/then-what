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
 * Returns null if no puzzle is scheduled for today.
 */
export async function fetchTodayPuzzle(): Promise<TodayPuzzleResponse | null> {
  const { data, error } = await supabase.rpc('get_today_puzzle');

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
