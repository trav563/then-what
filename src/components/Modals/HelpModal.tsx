import React from 'react';
import { Modal } from './Modal';
import { CheckCircle2, GripVertical } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="How to Play">
      <div className="flex flex-col gap-6 text-slate-700">
        <p className="text-[15px] leading-relaxed font-medium">
          Put the 6 cards in the correct chronological order. You get <strong className="text-slate-900">5 attempts</strong>.
        </p>

        <div className="flex flex-col gap-5">
          <div className="flex gap-4 items-start">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
              <GripVertical className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <p className="font-bold text-slate-900 mb-0.5">Snippets First</p>
              <p className="text-[14px] text-slate-600 leading-snug">Cards start with only a few words visible. Use the title and theme as clues!</p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900 mb-0.5">Green = Correct</p>
              <p className="text-[14px] text-slate-600 leading-snug">Cards in the right spot turn green, lock in place, and reveal their full text.</p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
              <span className="text-amber-600 font-bold text-sm">~</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 mb-0.5">Yellow = Close</p>
              <p className="text-[14px] text-slate-600 leading-snug">Cards one spot away from the correct position turn yellow. Shift them!</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 mt-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Example</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <span className="text-[14px] font-medium text-emerald-900">1. You wake up late.</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-300 rounded-xl">
              <span className="text-amber-500 font-bold text-sm flex-shrink-0 w-5 text-center">~</span>
              <span className="text-[14px] font-medium text-amber-900">2. You rush to...</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
              <GripVertical className="w-5 h-5 text-slate-300 flex-shrink-0" />
              <span className="text-[14px] font-medium text-slate-700">3. The alarm clock...</span>
            </div>
          </div>
          <p className="text-[13px] text-slate-500 mt-4 font-medium">
            Green cards reveal their full text. Yellow cards are close — try shifting them one spot.
          </p>
        </div>
      </div>
    </Modal>
  );
}
