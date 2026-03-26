import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { GameState, GameStats, Puzzle } from '../../types';
import { Share2, BarChart2, Sparkles, Globe2 } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../../services/supabase';

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
  const [distribution, setDistribution] = useState<{attempts: number, count: number}[] | null>(null);

  const isWon = gameState.status === 'won';
  const isGold = isWon && gameState.attempts === 1;

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

  useEffect(() => {
    if (isOpen && puzzle.id) {
      supabase.rpc('get_puzzle_distribution', { p_puzzle_id: puzzle.id })
        .then(({ data, error }) => {
          if (!error && data) {
            setDistribution(data as any);
          }
        });
    }
  }, [isOpen, puzzle.id]);

  const renderDistribution = () => {
    if (!distribution || distribution.length === 0) return null;
    
    // Convert to map
    const map = new Map<number, number>(distribution.map(d => [d.attempts, Number(d.count)]));
    const totalPlayers = Array.from(map.values()).reduce((a, b) => a + b, 0);
    // If no players yet, don't show
    if (totalPlayers === 0) return null;

    const maxCount = Math.max(...Array.from(map.values()), 1); 
    const rows = [1, 2, 3, 4, 5, -1];

    return (
      <div className="w-full bg-slate-50 p-4 pt-3.5 rounded-2xl border border-slate-100 mb-6 relative overflow-hidden">
        <div className="flex justify-between items-center mb-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 flex-1 break-all">
            <Globe2 className="w-3.5 h-3.5 text-slate-400/80 shrink-0" />
            Global Pulse
          </p>
        </div>
        <div className="flex flex-col gap-1.5 w-full">
          {rows.map(row => {
            const count = map.get(row) || 0;
            const percentage = maxCount === 0 ? 0 : Math.round((count / maxCount) * 100);
            
            // Highlight the row if it's the user's attempt
            const isMyRow = isWon ? row === gameState.attempts : row === -1;
            
            return (
              <div key={row} className="flex items-center text-xs h-5.5 relative">
                <div className="w-3 text-right font-bold text-slate-400 mr-2 shrink-0">
                  {row === -1 ? 'X' : row}
                </div>
                <div className="flex-1 bg-white border border-slate-100 h-full rounded flex items-center overflow-hidden">
                  <div 
                    className={`h-full flex items-center justify-end px-2 text-[10px] sm:text-xs font-bold text-white transition-all duration-1000 ease-out min-w-[20px] sm:min-w-[24px] ${isMyRow ? (isGold ? 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] shadow-inner' : 'bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-inner') : 'bg-slate-300'}`}
                    style={{ width: `${Math.max(percentage, 5)}%` }} 
                  >
                    {count}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Subtle total players badge */}
        <div className="absolute top-3 right-3 text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm">
          {totalPlayers} Plays
        </div>
      </div>
    );
  };

  const handleShare = async () => {
    const attemptsStr = isWon ? gameState.attempts : 'X';
    let shareText = `THEN WHAT? #${puzzle.number}\n`;
    
    (gameState.history || []).forEach((attempt) => {
      shareText += attempt.map((correct) => correct ? '🟩' : '⬜').join('') + '\n';
    });
    
    shareText += `${attemptsStr}/${gameState.maxAttempts}`;
    if (isGold) shareText += ' ✨';

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
            <p className={`text-sm font-bold uppercase tracking-widest mb-2 ${isGold ? 'text-[#C19B2E]' : 'text-emerald-500'}`}>
              Puzzle #{puzzle.number}
            </p>
            <p className="text-4xl font-black text-slate-900 tracking-tight">
              {isGold ? 'Perfect!' : 'Brilliant!'}
            </p>
            <p className="text-lg text-slate-600 mt-2 font-medium">
              Solved in {gameState.attempts}/{gameState.maxAttempts}
            </p>
            {isGold && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="flex items-center justify-center gap-1.5 mt-3"
              >
                <div className="flex items-center gap-1.5 px-4 py-2 bg-[#FFFDF8] border border-[#DEB841] rounded-full shadow-sm">
                  <Sparkles className="w-4 h-4 text-[#C19B2E]" />
                  <span className="text-sm font-bold text-[#A88210]">Perfect Solve</span>
                </div>
              </motion.div>
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
          <div className={`flex-1 rounded-2xl p-4 border ${isGold ? 'bg-gradient-to-b from-[#FFFDF8] to-[#FFF9EC] border-[#E5C158]/50 shadow-sm shadow-[#D4AF37]/5' : 'bg-orange-50/50 border-orange-100'}`}>
            <p className={`text-3xl font-black ${isGold ? 'text-[#B5911C]' : 'text-orange-600'}`}>{stats.currentStreak}</p>
            <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isGold ? 'text-[#B5911C]/70' : 'text-orange-600/60'}`}>Streak</p>
          </div>
          <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-3xl font-black text-slate-800">{stats.longestStreak}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Max</p>
          </div>
        </div>

        {renderDistribution()}

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={handleShare}
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-lg text-white active:scale-[0.98] transition-all shadow-lg ${
              isGold
                ? 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] hover:from-[#C49B2E] hover:to-[#A67C0A] shadow-[#D4AF37]/30'
                : 'bg-slate-900 hover:bg-slate-800 shadow-slate-900/20'
            }`}
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
