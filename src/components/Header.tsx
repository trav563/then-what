import React from 'react';
import { HelpCircle, BarChart2 } from 'lucide-react';

interface HeaderProps {
  onShowHelp: () => void;
  onShowStats: () => void;
  streak: number;
  isPreview?: boolean;
  isArchive?: boolean;
}

export function Header({ onShowHelp, onShowStats, streak, isPreview, isArchive }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-40">
      <div className="flex items-center gap-2 w-1/3">
        <button
          onClick={onShowHelp}
          className="p-2.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="How to play"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 text-center flex flex-col items-center justify-center">
        <h1 className="text-base font-black tracking-tight text-slate-900">
          THEN WHAT?
        </h1>
        {isPreview && (
          <span className="text-[9px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded uppercase tracking-widest mt-0.5">
            Preview
          </span>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 w-1/3">
        {streak > 0 && (
          <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100">
            <span className="text-sm font-bold text-orange-600">{streak}</span>
            <span className="text-base leading-none">🔥</span>
          </div>
        )}
        <button
          onClick={onShowStats}
          className="p-2.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Statistics"
        >
          <BarChart2 className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
