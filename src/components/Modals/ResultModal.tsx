import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { GameState, GameStats, Puzzle } from '../../types';
import { Share2, BarChart2 } from 'lucide-react';
import confetti from 'canvas-confetti';

interface ResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameState: GameState;
  stats: GameStats;
  puzzle: Puzzle;
  onShowStats: () => void;
  isPreview?: boolean;
}

export function ResultModal({
  isOpen,
  onClose,
  gameState,
  stats,
  puzzle,
  onShowStats,
  isPreview,
}: ResultModalProps) {
  const [timeLeft, setTimeLeft] = useState('');
  const [copied, setCopied] = useState(false);

  const isWon = gameState.status === 'won';

  // Fire confetti on win
  useEffect(() => {
    if (!isOpen || !isWon) return;
    
    const duration = 2000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors: ['#10b981', '#f59e0b', '#6366f1', '#f43f5e'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors: ['#10b981', '#f59e0b', '#6366f1', '#f43f5e'],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }, [isOpen, isWon]);

  useEffect(() => {
    if (!isOpen) return;

    const updateTimer = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      const diff = tomorrow.getTime() - now.getTime();

      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);

      setTimeLeft(
        `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleShare = async () => {
    const attemptsStr = isWon ? gameState.attempts : 'X';
    let shareText = `THEN WHAT? #${puzzle.number}\n`;
    
    (gameState.history || []).forEach((attempt) => {
      shareText += attempt.map((status) => {
        if (status === true || status === 'green') return '🟩';
        if (status === 'yellow') return '🟨';
        return '⬜';
      }).join('') + '\n';
    });
    
    shareText += `${attemptsStr}/${gameState.maxAttempts}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Then What?',
          text: shareText,
        });
      } else {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      console.error('Error sharing', e);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col items-center text-center pt-2">
        {isWon ? (
          <div className="mb-8">
            <p className="text-sm font-bold text-emerald-500 uppercase tracking-widest mb-2">
              Puzzle #{puzzle.number}
            </p>
            <p className="text-4xl font-black text-slate-900 tracking-tight">
              Brilliant!
            </p>
            <p className="text-lg text-slate-600 mt-2 font-medium">
              Solved in {gameState.attempts}/{gameState.maxAttempts}
            </p>
            {puzzle.flavorText && (
              <p className="text-sm text-slate-500 mt-4 italic">
                "{puzzle.flavorText}"
              </p>
            )}
          </div>
        ) : (
          <div className="mb-8 w-full">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">
              Puzzle #{puzzle.number}
            </p>
            <p className="text-3xl font-black text-slate-900 tracking-tight mb-2">
              Not quite...
            </p>
            {puzzle.flavorText && (
              <p className="text-sm text-slate-500 mb-6 italic">
                "{puzzle.flavorText}"
              </p>
            )}
            <div className="flex flex-col gap-2.5 text-left bg-slate-50 p-5 rounded-2xl border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Correct Order</p>
              {puzzle.correctOrder.map((id, i) => {
                const card = puzzle.cards.find((c) => c.id === id);
                return (
                  <div key={id} className="flex gap-3">
                    <span className="text-slate-300 font-bold text-sm mt-0.5">{i + 1}.</span>
                    <span className="text-[15px] font-medium text-slate-700 leading-snug">{card?.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3 w-full mb-8">
          <div className="flex-1 bg-orange-50/50 rounded-2xl p-4 border border-orange-100">
            <p className="text-3xl font-black text-orange-600">{stats.currentStreak}</p>
            <p className="text-[10px] font-bold text-orange-600/60 uppercase tracking-widest mt-1">Streak</p>
          </div>
          <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-3xl font-black text-slate-800">{stats.longestStreak}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Max</p>
          </div>
        </div>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={handleShare}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-lg text-white bg-slate-900 hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg shadow-slate-900/20"
          >
            <Share2 className="w-5 h-5" />
            {copied ? 'Copied to clipboard!' : 'Share Result'}
          </button>
          
          <button
            onClick={() => {
              onClose();
              onShowStats();
            }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] transition-all"
          >
            <BarChart2 className="w-5 h-5" />
            View Statistics
          </button>
        </div>

        {!isPreview && (
          <div className="mt-8 pt-6 border-t border-slate-100 w-full">
            <p className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-widest">Next puzzle in</p>
            <p className="text-2xl font-mono font-black text-slate-800 tracking-tight">{timeLeft}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
