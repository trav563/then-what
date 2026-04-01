import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableCard, LockedCard } from './Card';
import { GameState, Puzzle } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface GameBoardProps {
  puzzle: Puzzle;
  gameState: GameState;
  onReorder: (newOrder: string[]) => void;
  onSubmit: () => boolean[] | null;
  onCommitReveal: (results: boolean[]) => void;
  isGold?: boolean;
  showStoryMerge?: boolean;
  onGoldCelebration?: () => void;
}

import { cn } from './Card';

const REVEAL_DELAY_MS = 200; // delay between each card reveal

export function GameBoard({ puzzle, gameState, onReorder, onSubmit, onCommitReveal, isGold, showStoryMerge, onGoldCelebration }: GameBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  // Sequential reveal state (local to component, drives animations)
  const [revealResults, setRevealResults] = useState<boolean[] | null>(null);
  const [revealIndex, setRevealIndex] = useState(-1); // which card index is currently being revealed (-1 = none)
  const [revealComplete, setRevealComplete] = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasOrderChanged = useMemo(() => {
    if (!gameState.lastAttemptOrder) return true;
    return JSON.stringify(gameState.currentOrder) !== JSON.stringify(gameState.lastAttemptOrder);
  }, [gameState.currentOrder, gameState.lastAttemptOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const unlockedIds = useMemo(() => {
    return gameState.currentOrder.filter((_, index) => !gameState.lockedPositions[index]);
  }, [gameState.currentOrder, gameState.lockedPositions]);

  function handleDragStart(event: DragStartEvent) {
    if (isChecking || revealResults) return; // prevent dragging during reveal
    setActiveId(event.active.id as string);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (isChecking || revealResults) return;
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = unlockedIds.indexOf(active.id as string);
      const newIndex = unlockedIds.indexOf(over.id as string);

      const newUnlockedIds = arrayMove(unlockedIds, oldIndex, newIndex);

      let unlockedIndex = 0;
      const newOrder = gameState.currentOrder.map((id, index) => {
        if (gameState.lockedPositions[index]) {
          return id;
        } else {
          return newUnlockedIds[unlockedIndex++] as string;
        }
      });

      onReorder(newOrder);
      if (navigator.vibrate) navigator.vibrate(10);
    }
  }

  const activeCard = useMemo(() => {
    if (!activeId) return null;
    return puzzle.cards.find((c) => c.id === activeId);
  }, [activeId, puzzle.cards]);

  const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.4',
        },
      },
    }),
  };

  // ─── Sequential Reveal Logic ───
  const startReveal = useCallback(() => {
    if (isChecking || revealResults) return;
    
    setIsChecking(true);
    if (navigator.vibrate) navigator.vibrate(50);

    // Brief initial pause for "checking" feel
    setTimeout(() => {
      const results = onSubmit();
      if (!results) {
        setIsChecking(false);
        return;
      }
      
      setRevealResults(results);
      setRevealIndex(-1);
      setRevealComplete(false);
    }, 400);
  }, [isChecking, revealResults, onSubmit]);

  // Drive the sequential reveal timer
  useEffect(() => {
    if (!revealResults || revealComplete) return;

    const nextIndex = revealIndex + 1;
    if (nextIndex >= 6) {
      // All cards revealed — commit state
      setRevealComplete(true);
      
      const allCorrect = revealResults.every(r => r);
      const isGoldSolve = allCorrect && gameState.attempts === 0; // attempts haven't been incremented yet

      // Brief dramatic pause after last reveal before committing
      revealTimerRef.current = setTimeout(() => {
        onCommitReveal(revealResults);
        
        // Fire gold celebration right when the state commits
        if (isGoldSolve && onGoldCelebration) {
          onGoldCelebration();
        }
        
        // Reset local reveal state after a short delay
        setTimeout(() => {
          setRevealResults(null);
          setRevealIndex(-1);
          setRevealComplete(false);
          setIsChecking(false);
        }, 200);
      }, 500);
      return;
    }

    revealTimerRef.current = setTimeout(() => {
      setRevealIndex(nextIndex);
      // Haptic tick for each reveal
      if (navigator.vibrate) {
        navigator.vibrate(revealResults[nextIndex] ? 15 : 8);
      }
    }, nextIndex === 0 ? 100 : REVEAL_DELAY_MS);

    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, [revealResults, revealIndex, revealComplete, onCommitReveal, onGoldCelebration, gameState.attempts]);

  // Determine per-card reveal state for rendering
  const getCardRevealState = (index: number): 'idle' | 'pending' | 'correct' | 'incorrect' => {
    if (!revealResults || revealIndex < 0) return 'idle';
    if (index > revealIndex) return 'pending';
    return revealResults[index] ? 'correct' : 'incorrect';
  };

  return (
    <div className={cn("w-full max-w-md mx-auto px-4 pt-4 transition-all duration-500", showStoryMerge ? "pb-4" : "pb-40")}>
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
          Puzzle {puzzle.number}
        </span>
        <h2 className="text-lg font-black text-slate-900 tracking-tight mb-1">
          {puzzle.title}
        </h2>
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4">
          {puzzle.theme.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
        </span>
        
        <div className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
          gameState.status === 'playing' ? "text-slate-600 bg-slate-100" :
          gameState.status === 'won' ? "text-emerald-700 bg-emerald-50" :
          "text-slate-600 bg-slate-100"
        }`}>
          {gameState.status === 'playing'
            ? (gameState.attempts === gameState.maxAttempts - 1 ? 'Final attempt' : `Attempt ${gameState.attempts + 1} of ${gameState.maxAttempts}`)
            : gameState.status === 'won'
              ? 'Completed for today'
              : 'Out of attempts'}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <motion.div
          initial={false}
          animate={{
            height: showStoryMerge ? 0 : 'auto',
            opacity: showStoryMerge ? 0 : 1,
            scale: showStoryMerge ? 0.95 : 1
          }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className={showStoryMerge ? "overflow-hidden" : "overflow-visible"}
        >
          <SortableContext
            items={unlockedIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-0 pb-4">
              {gameState.currentOrder.map((id, index) => {
                const card = puzzle.cards.find((c) => c.id === id);
                if (!card) return null;

                const isLocked = gameState.lockedPositions[index];
                const isFailed = gameState.status === 'lost';
                const cardRevealState = getCardRevealState(index);
                
                // During reveal, just-revealed correct cards should look like they're locking
                const showAsRevealing = cardRevealState === 'correct' && !isLocked;
                const showAsIncorrect = cardRevealState === 'incorrect';

                return (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0,
                      // Shake effect for incorrect cards during reveal
                      x: showAsIncorrect ? [0, -4, 4, -3, 3, 0] : 0,
                    }}
                    transition={{ 
                      duration: 0.35, 
                      delay: index * 0.06, 
                      ease: 'easeOut',
                      x: showAsIncorrect ? { duration: 0.4, ease: 'easeInOut' } : {},
                    }}
                    layout
                  >
                    <SortableCard 
                      key={id} 
                      id={id} 
                      text={card.text} 
                      isLocked={isLocked || showAsRevealing}
                      isFailed={isFailed}
                      isGold={isGold && isLocked}
                      isDragging={activeId === id}
                      revealState={cardRevealState}
                    />
                  </motion.div>
                );
              })}
            </div>
          </SortableContext>
        </motion.div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeCard ? (
            <SortableCard 
              id={activeCard.id} 
              text={activeCard.text} 
              isLocked={false} 
              isDragging={true}
              isOverlay={true}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent z-20 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          {gameState.status === 'playing' ? (
            <button
              onClick={() => {
                if (isChecking || !hasOrderChanged) return;
                startReveal();
              }}
              disabled={isChecking || !hasOrderChanged}
              className={cn(
                "w-full py-3.5 rounded-xl font-bold text-base transition-all",
                isChecking
                  ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                  : !hasOrderChanged
                    ? "bg-slate-200 text-slate-500 cursor-not-allowed border-2 border-slate-300 border-dashed"
                    : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] shadow-lg shadow-slate-900/10"
              )}
            >
              {isChecking 
                ? 'Checking...' 
                : !hasOrderChanged 
                  ? 'Change order to try again' 
                  : 'Check Order'}
            </button>
          ) : (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('show-result'))}
              className="w-full py-3.5 rounded-xl font-bold text-base text-white bg-slate-900 hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg shadow-slate-900/10"
            >
              View Results
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
