import React from 'react';
import { Modal } from './Modal';
import { GameStats } from '../../types';
import { motion } from 'motion/react';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: GameStats;
}

export function StatsModal({ isOpen, onClose, stats }: StatsModalProps) {
  const maxDistribution = Math.max(
    ...Object.values(stats.solveDistribution)
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Statistics">
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="flex flex-col items-center justify-center">
            <span className="text-3xl font-black text-slate-800">{stats.puzzlesPlayed}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Played</span>
          </div>
          <div className="flex flex-col items-center justify-center">
            <span className="text-3xl font-black text-slate-800">
              {stats.puzzlesPlayed > 0 ? Math.round((stats.puzzlesSolved / stats.puzzlesPlayed) * 100) : 0}%
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Solve Rate</span>
          </div>
          <div className="flex flex-col items-center justify-center">
            <span className="text-3xl font-black text-slate-800">{stats.currentStreak}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Streak</span>
          </div>
          <div className="flex flex-col items-center justify-center">
            <span className="text-3xl font-black text-slate-800">{stats.longestStreak}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Max</span>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Guess Distribution</h3>
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5, 'fail'].map((key) => {
              const count = stats.solveDistribution[key as keyof typeof stats.solveDistribution];
              const width = maxDistribution > 0 ? Math.max(8, (count / maxDistribution) * 100) : 8;
              const isFail = key === 'fail';
              
              return (
                <div key={key} className="flex items-center gap-3 text-sm">
                  <div className="w-4 text-right font-bold text-slate-500">
                    {isFail ? 'X' : key}
                  </div>
                  <div className="flex-1 h-7 bg-slate-100 rounded-md overflow-hidden flex items-center">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className={`h-full flex items-center justify-end px-3 text-xs font-bold text-white ${isFail ? 'bg-slate-400' : 'bg-emerald-500'}`}
                    >
                      {count > 0 ? count : ''}
                    </motion.div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
