import { PuzzleRecord, GenerationBatch, AnalyticsEvent, AutomationSettings } from '../types';
import { puzzles as initialPuzzles } from '../data/puzzles';
import { schedule as initialSchedule } from '../data/schedule';

const DB_KEY_PUZZLES = 'then-what-db-puzzles';
const DB_KEY_SCHEDULE = 'then-what-db-schedule';
const DB_KEY_BATCHES = 'then-what-db-batches';
const DB_KEY_ANALYTICS = 'then-what-db-analytics';
const DB_KEY_AUTOMATION = 'then-what-db-automation';

export function initDB() {
  if (!localStorage.getItem(DB_KEY_PUZZLES)) {
    const puzzlesMap: Record<string, PuzzleRecord> = {};
    const now = Date.now();
    
    initialPuzzles.forEach(p => {
      let status: PuzzleRecord['status'] = 'draft';
      if (p.status === 'approved') status = 'approved';
      else if (p.status === 'candidate') status = 'ai_reviewed';
      else if (p.status === 'cut') status = 'retired';
      
      puzzlesMap[p.id] = {
        id: p.id,
        number: p.number,
        title: p.title,
        theme: p.theme,
        cards: p.cards,
        correctOrder: p.correctOrder,
        status,
        source: 'initial_seed',
        createdAt: now,
        updatedAt: now,
        notes: p.status === 'candidate' ? 'Needs review' : undefined,
      };
    });
    
    localStorage.setItem(DB_KEY_PUZZLES, JSON.stringify(puzzlesMap));
  }
  
  if (!localStorage.getItem(DB_KEY_SCHEDULE)) {
    localStorage.setItem(DB_KEY_SCHEDULE, JSON.stringify(initialSchedule));
  }
  
  if (!localStorage.getItem(DB_KEY_BATCHES)) {
    localStorage.setItem(DB_KEY_BATCHES, JSON.stringify({}));
  }
  
  if (!localStorage.getItem(DB_KEY_ANALYTICS)) {
    localStorage.setItem(DB_KEY_ANALYTICS, JSON.stringify([]));
  }

  if (!localStorage.getItem(DB_KEY_AUTOMATION)) {
    const defaultSettings: AutomationSettings = {
      enabled: false,
      threshold: 14,
      batchSize: 20,
    };
    localStorage.setItem(DB_KEY_AUTOMATION, JSON.stringify(defaultSettings));
  }
}

/**
 * Returns today's date as a YYYY-MM-DD string in local timezone.
 */
export function getLocalDateString(date?: Date): string {
  const d = date || new Date();
  return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

/**
 * Lifecycle sweep: transitions past scheduled puzzles to published.
 * Should be called once on app load (from main.tsx).
 */
export function sweepPuzzleLifecycle() {
  const today = getLocalDateString();
  const schedule = getSchedule();
  const data = localStorage.getItem(DB_KEY_PUZZLES);
  if (!data) return;
  const map = JSON.parse(data) as Record<string, PuzzleRecord>;
  let changed = false;

  for (const [dateStr, puzzleId] of Object.entries(schedule)) {
    if (dateStr < today) {
      const puzzle = map[puzzleId];
      if (puzzle && puzzle.status === 'scheduled') {
        puzzle.status = 'published';
        puzzle.publishedAt = Date.now();
        puzzle.updatedAt = Date.now();
        changed = true;
      }
    }
  }

  if (changed) {
    localStorage.setItem(DB_KEY_PUZZLES, JSON.stringify(map));
  }
}

export function getAutomationSettings(): AutomationSettings {
  const data = localStorage.getItem(DB_KEY_AUTOMATION);
  if (!data) {
    return {
      enabled: false,
      threshold: 14,
      batchSize: 20,
    };
  }
  return JSON.parse(data);
}

export function saveAutomationSettings(settings: AutomationSettings) {
  localStorage.setItem(DB_KEY_AUTOMATION, JSON.stringify(settings));
}

export function getPuzzles(): PuzzleRecord[] {
  const data = localStorage.getItem(DB_KEY_PUZZLES);
  if (!data) return [];
  const map = JSON.parse(data) as Record<string, PuzzleRecord>;
  return Object.values(map);
}

export function getPuzzle(id: string): PuzzleRecord | null {
  const data = localStorage.getItem(DB_KEY_PUZZLES);
  if (!data) return null;
  const map = JSON.parse(data) as Record<string, PuzzleRecord>;
  return map[id] || null;
}

export function getPuzzleById(id: string): PuzzleRecord | null {
  const dbPuzzle = getPuzzle(id);
  if (dbPuzzle) return dbPuzzle;
  return initialPuzzles.find(p => p.id === id) as PuzzleRecord || null;
}

export interface TodayPuzzleResult {
  puzzle: PuzzleRecord;
  isArchive: boolean;
}

export function getTodayPuzzle(): TodayPuzzleResult | null {
  const dateString = getLocalDateString();
  
  const currentSchedule = getSchedule();
  const puzzleId = currentSchedule[dateString] || initialSchedule[dateString];
  
  if (puzzleId) {
    const puzzle = getPuzzleById(puzzleId);
    if (puzzle) return { puzzle, isArchive: false };
  }
  
  // Fallback: find the most recently published puzzle as an archive puzzle
  const allPuzzles = getPuzzles();
  const publishedPuzzles = allPuzzles
    .filter(p => p.status === 'published' && p.publishedAt)
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  
  if (publishedPuzzles.length > 0) {
    return { puzzle: publishedPuzzles[0], isArchive: true };
  }
  
  // Last resort: any approved puzzle
  const approvedPuzzles = allPuzzles.filter(p => p.status === 'approved');
  if (approvedPuzzles.length > 0) {
    return { puzzle: approvedPuzzles[0], isArchive: true };
  }
  
  return null;
}

export function savePuzzle(puzzle: PuzzleRecord) {
  const data = localStorage.getItem(DB_KEY_PUZZLES);
  const map = data ? JSON.parse(data) : {};
  puzzle.updatedAt = Date.now();
  map[puzzle.id] = puzzle;
  localStorage.setItem(DB_KEY_PUZZLES, JSON.stringify(map));
}

export function getSchedule(): Record<string, string> {
  const data = localStorage.getItem(DB_KEY_SCHEDULE);
  return data ? JSON.parse(data) : {};
}

export function saveSchedule(schedule: Record<string, string>) {
  localStorage.setItem(DB_KEY_SCHEDULE, JSON.stringify(schedule));
}

export function getBatches(): GenerationBatch[] {
  const data = localStorage.getItem(DB_KEY_BATCHES);
  if (!data) return [];
  const map = JSON.parse(data) as Record<string, GenerationBatch>;
  return Object.values(map).sort((a, b) => b.createdAt - a.createdAt);
}

export function getBatch(id: string): GenerationBatch | null {
  const data = localStorage.getItem(DB_KEY_BATCHES);
  if (!data) return null;
  const map = JSON.parse(data) as Record<string, GenerationBatch>;
  return map[id] || null;
}

export function saveBatch(batch: GenerationBatch) {
  const data = localStorage.getItem(DB_KEY_BATCHES);
  const map = data ? JSON.parse(data) : {};
  map[batch.id] = batch;
  localStorage.setItem(DB_KEY_BATCHES, JSON.stringify(map));
}

export function getAnalytics(): AnalyticsEvent[] {
  const data = localStorage.getItem(DB_KEY_ANALYTICS);
  return data ? JSON.parse(data) : [];
}

export function trackEvent(
  type: AnalyticsEvent['type'],
  puzzleId: string,
  data?: any
) {
  const events = getAnalytics();
  const event: AnalyticsEvent = {
    id: crypto.randomUUID(),
    type,
    puzzleId,
    date: new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    data,
  };
  events.push(event);
  localStorage.setItem(DB_KEY_ANALYTICS, JSON.stringify(events));
}
