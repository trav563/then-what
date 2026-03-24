export interface CardData {
  id: string;
  text: string;
}

export type PuzzleStatus = 'draft' | 'ai_reviewed' | 'approved' | 'scheduled' | 'published' | 'retired' | 'rejected';

export interface PuzzleEvaluation {
  clarity: number;
  endingStrength: number;
  anchorStrength: number;
  ambiguityRisk: number;
  novelty: number;
  likelyDifficulty: 'easy' | 'medium' | 'hard';
  recommendedDecision: 'approve' | 'revise' | 'reject';
  shortReason: string;
}

export interface PuzzleRecord {
  id: string;
  number?: number;
  title: string;
  theme: string;
  cards: CardData[];
  correctOrder: string[];
  status: PuzzleStatus;
  source?: string;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  scheduledFor?: string; // YYYY-MM-DD
  publishedAt?: number;
  retiredAt?: number;
  rejectedAt?: number;
  notes?: string;
  evaluation?: PuzzleEvaluation;
  generationBatchId?: string;
  similarityWarning?: string;
  isAutoRecommended?: boolean;
}

export interface GenerationSettings {
  count: number;
  themeMix?: string;
  instructionEmphasis?: string;
  excludeThemes?: string;
}

export interface AutomationSettings {
  enabled: boolean;
  threshold: number;
  batchSize: number;
  themeMix?: string;
  instructionEmphasis?: string;
  excludeThemes?: string;
}

export interface GenerationBatch {
  id: string;
  createdAt: number;
  settings: GenerationSettings;
  puzzleIds: string[];
  status: 'generating' | 'evaluating' | 'completed' | 'failed';
  summary?: {
    strongestCandidates: string[];
    weakestCandidates: string[];
    themeDistribution: Record<string, number>;
    averageEndingStrength: number;
    averageAmbiguityRisk: number;
  };
}

export interface AnalyticsEvent {
  id: string;
  type: 'puzzle_loaded' | 'puzzle_started' | 'attempt_submitted' | 'puzzle_solved' | 'puzzle_failed' | 'results_shared' | 'streak_continued' | 'streak_broken';
  puzzleId: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  data?: any;
}

export interface Puzzle {
  id: string; // e.g. puz_001
  number?: number;
  title: string;
  theme: string;
  cards: CardData[];
  correctOrder: string[]; // array of card ids
  flavorText?: string;
  status?: PuzzleStatus | 'cut' | 'candidate';
}

export interface GameState {
  lastPlayedDate: string | null;
  currentPuzzleId: string | null;
  attempts: number;
  maxAttempts: number;
  status: 'playing' | 'won' | 'lost';
  currentOrder: string[]; // array of card ids
  lockedPositions: boolean[]; // array of booleans, true if locked at that index
  history: boolean[][]; // array of locked positions for each attempt
}

export interface GameStats {
  currentStreak: number;
  longestStreak: number;
  puzzlesPlayed: number;
  puzzlesSolved: number;
  firstTrySolves: number;
  solveDistribution: {
    1: number;
    2: number;
    3: number;
    fail: number;
  };
}
