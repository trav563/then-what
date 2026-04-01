import { useState, useEffect, useCallback } from 'react';
import { GameState, GameStats, Puzzle } from '../types';
import { shuffleArray } from '../utils/shuffle';
import { trackEvent } from '../services/analytics';
import { fetchTodayPuzzle } from '../services/supabase';

const GAME_STATE_KEY = 'then-what-game-state';
const GAME_STATS_KEY = 'then-what-game-stats';

const DEFAULT_STATS: GameStats = {
  currentStreak: 0,
  longestStreak: 0,
  puzzlesPlayed: 0,
  puzzlesSolved: 0,
  firstTrySolves: 0,
  solveDistribution: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    fail: 0,
  },
};

export function useGameState(previewPuzzleId?: string | null) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [stats, setStats] = useState<GameStats>(DEFAULT_STATS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isArchive, setIsArchive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPuzzle() {
      const isPreview = !!previewPuzzleId;
      let targetPuzzle: Puzzle | null = null;
      let archiveMode = false;

      if (isPreview) {
        // Dev preview: dynamically import to avoid bundling puzzle data in production
        const { getPuzzleById } = await import('../services/db');
        targetPuzzle = getPuzzleById(previewPuzzleId);
      } else {
        // Public game: fetch from Supabase
        try {
          const response = await fetchTodayPuzzle();
          if (response) {
            targetPuzzle = {
              id: response.id,
              number: response.number,
              title: response.title,
              theme: response.theme,
              flavorText: response.flavor_text,
              storyText: response.story_text,
              isTrueStory: response.is_true_story,
              funFact: response.fun_fact,
              cards: response.cards,
              correctOrder: response.correct_order,
            };
          }
        } catch (err) {
          console.error('Failed to fetch puzzle from Supabase:', err);
        }
      }

      if (cancelled) return;

      setPuzzle(targetPuzzle);
      setIsArchive(archiveMode);

      if (targetPuzzle && !isPreview) {
        trackEvent('puzzle_loaded', targetPuzzle.id);
      }

      // Load stats
      const savedStats = localStorage.getItem(GAME_STATS_KEY);
      let currentStats = DEFAULT_STATS;
      if (savedStats) {
        try {
          const parsedStats = JSON.parse(savedStats);
          currentStats = {
            ...DEFAULT_STATS,
            ...parsedStats,
            solveDistribution: {
              ...DEFAULT_STATS.solveDistribution,
              ...(parsedStats.solveDistribution || {}),
            }
          };
          setStats(currentStats);
        } catch (e) {
          console.error('Failed to parse stats', e);
        }
      }

      if (!targetPuzzle) {
        setIsLoaded(true);
        return;
      }

      // Load game state if not in preview mode
      if (!isPreview) {
        const savedState = localStorage.getItem(GAME_STATE_KEY);
        if (savedState) {
          try {
            const parsedState = JSON.parse(savedState) as GameState;
            if (parsedState.currentPuzzleId === targetPuzzle.id) {
              setGameState({
                ...parsedState,
                history: parsedState.history || [],
              });
              setIsLoaded(true);
              return;
            } else {
              const lastPlayedDate = new Date(parsedState.lastPlayedDate || '');
              const todayDate = new Date(new Date().toISOString().split('T')[0]);
              const diffDays = Math.floor((todayDate.getTime() - lastPlayedDate.getTime()) / (1000 * 60 * 60 * 24));
              
              if (diffDays > 1 && currentStats.currentStreak > 0) {
                const newStats = { ...currentStats, currentStreak: 0 };
                setStats(newStats);
                localStorage.setItem(GAME_STATS_KEY, JSON.stringify(newStats));
                trackEvent('streak_broken', targetPuzzle.id);
              }
            }
          } catch (e) {
            console.error('Failed to parse game state', e);
          }
        }
      }

      // Initialize new game state
      let initialOrder = shuffleArray(targetPuzzle.cards.map(c => c.id));
      while (initialOrder.join(',') === targetPuzzle.correctOrder.join(',')) {
        initialOrder = shuffleArray(targetPuzzle.cards.map(c => c.id));
      }

      const newState: GameState = {
        lastPlayedDate: new Date().toISOString().split('T')[0],
        currentPuzzleId: targetPuzzle.id,
        attempts: 0,
        maxAttempts: 5,
        status: 'playing',
        currentOrder: initialOrder,
        lockedPositions: Array(6).fill(false),
        history: [],
      };
      
      setGameState(newState);
      if (!isPreview) {
        localStorage.setItem(GAME_STATE_KEY, JSON.stringify(newState));
        trackEvent('puzzle_started', targetPuzzle.id);
      }
      setIsLoaded(true);
    }

    loadPuzzle();

    return () => { cancelled = true; };
  }, [previewPuzzleId]);

  const saveState = useCallback((newState: GameState) => {
    setGameState(newState);
    if (!previewPuzzleId) {
      localStorage.setItem(GAME_STATE_KEY, JSON.stringify(newState));
    }
  }, [previewPuzzleId]);

  const saveStats = useCallback((newStats: GameStats) => {
    setStats(newStats);
    if (!previewPuzzleId) {
      localStorage.setItem(GAME_STATS_KEY, JSON.stringify(newStats));
    }
  }, [previewPuzzleId]);

  // Phase 1: Calculate results and return them for the sequential reveal animation.
  // Does NOT commit state changes yet — that happens in commitReveal.
  const submitAttempt = useCallback((): boolean[] | null => {
    if (!gameState || !puzzle || gameState.status !== 'playing') return null;

    if (!previewPuzzleId) {
      trackEvent('attempt_submitted', puzzle.id, { attemptNumber: gameState.attempts + 1 });
    }

    const attemptResult: boolean[] = Array(6).fill(false);

    for (let i = 0; i < 6; i++) {
      const cardId = gameState.currentOrder[i];
      if (cardId === puzzle.correctOrder[i]) {
        attemptResult[i] = true;
      }
    }

    // Set the reveal phase to 'revealing' so the board can animate
    saveState({
      ...gameState,
      revealPhase: 'revealing',
      revealedCards: 0,
      lastAttemptOrder: [...gameState.currentOrder],
    });

    return attemptResult;
  }, [gameState, puzzle, saveState, previewPuzzleId]);

  // Phase 2: Called after the sequential reveal animation completes.
  // Commits the locked positions, status, stats — all the real game logic.
  const commitReveal = useCallback((attemptResult: boolean[]) => {
    if (!gameState || !puzzle) return;

    const newLockedPositions = [...gameState.lockedPositions];
    let allCorrect = true;

    for (let i = 0; i < 6; i++) {
      if (attemptResult[i]) {
        newLockedPositions[i] = true;
      } else {
        allCorrect = false;
      }
    }

    const newAttempts = gameState.attempts + 1;
    let newStatus = gameState.status;
    let newOrder = [...gameState.currentOrder];

    if (allCorrect) {
      newStatus = 'won';
      if (!previewPuzzleId) trackEvent('puzzle_solved', puzzle.id, { attempts: newAttempts });
      if (!previewPuzzleId && newAttempts === 1) trackEvent('gold_solve', puzzle.id);
    } else if (newAttempts >= gameState.maxAttempts) {
      newStatus = 'lost';
      if (!previewPuzzleId) trackEvent('puzzle_failed', puzzle.id);
      // Reveal correct order on loss
      newOrder = [...puzzle.correctOrder];
      // Mark all as locked for the UI
      for (let i = 0; i < 6; i++) newLockedPositions[i] = true;
    }

    const newState: GameState = {
      ...gameState,
      attempts: newAttempts,
      status: newStatus,
      lockedPositions: newLockedPositions,
      currentOrder: newOrder,
      history: [...gameState.history, attemptResult],
      lastAttemptOrder: [...gameState.currentOrder],
      revealPhase: 'done',
      revealedCards: 6,
    };

    saveState(newState);

    // Update stats if game over
    if (newStatus !== 'playing') {
      const newStats = { ...stats };
      newStats.puzzlesPlayed += 1;
      
      if (newStatus === 'won') {
        newStats.puzzlesSolved += 1;
        newStats.currentStreak += 1;
        if (newStats.currentStreak > newStats.longestStreak) {
          newStats.longestStreak = newStats.currentStreak;
        }
        if (newAttempts === 1) {
          newStats.firstTrySolves += 1;
        }
        if (newAttempts <= 5) {
          newStats.solveDistribution[newAttempts as 1|2|3|4|5] += 1;
        }
        if (!previewPuzzleId) trackEvent('streak_continued', puzzle.id, { currentStreak: newStats.currentStreak });
      } else {
        newStats.currentStreak = 0;
        newStats.solveDistribution.fail += 1;
        if (!previewPuzzleId) trackEvent('streak_broken', puzzle.id);
      }
      
      saveStats(newStats);
    }
  }, [gameState, puzzle, stats, saveState, saveStats, previewPuzzleId]);

  const reorderCards = useCallback((newOrder: string[]) => {
    if (!gameState || gameState.status !== 'playing') return;
    saveState({
      ...gameState,
      currentOrder: newOrder,
    });
  }, [gameState, saveState]);

  return {
    puzzle,
    gameState,
    stats,
    isLoaded,
    isArchive,
    submitAttempt,
    commitReveal,
    reorderCards,
  };
}
