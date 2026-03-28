import React, { useState, useMemo } from 'react';
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
import { motion } from 'motion/react';

interface GameBoardProps {
  puzzle: Puzzle;
  gameState: GameState;
  onReorder: (newOrder: string[]) => void;
  onSubmit: () => void;
  isGold?: boolean;
  showStoryMerge?: boolean;
}

import { cn } from './Card';

export function GameBoard({ puzzle, gameState, onReorder, onSubmit, isGold, showStoryMerge }: GameBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

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
    setActiveId(event.active.id as string);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
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
          className="overflow-hidden"
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

                return (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
                    layout
                  >
                    <SortableCard 
                      key={id} 
                      id={id} 
                      text={card.text} 
                      isLocked={isLocked}
                      isFailed={isFailed}
                      isGold={isGold}
                      isDragging={activeId === id}
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
                if (navigator.vibrate) navigator.vibrate(50);
                onSubmit();
              }}
              className="w-full py-3.5 rounded-xl font-bold text-base text-white bg-slate-900 hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg shadow-slate-900/10"
            >
              Check Order
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
