import React from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { cn } from './Card';

interface StoryPanelProps {
  cards: { id: string; text: string }[];
  correctOrder: string[];
  title: string;
  theme: string;
  isGold: boolean;
  storyText?: string;
}

function stitchStory(cards: { id: string; text: string }[], correctOrder: string[]): string {
  const orderedTexts = correctOrder.map(id => {
    const card = cards.find(c => c.id === id);
    return card?.text || '';
  });

  // Light stitching: join sentences. If a sentence doesn't end with punctuation, add a period.
  return orderedTexts
    .map(t => t.trim())
    .map(t => {
      if (!t.endsWith('.') && !t.endsWith('!') && !t.endsWith('?') && !t.endsWith('…')) {
        return t + '.';
      }
      return t;
    })
    .join(' ');
}

export function StoryPanel({ cards, correctOrder, title, theme, isGold, storyText }: StoryPanelProps) {
  const story = storyText || stitchStory(cards, correctOrder);
  const themeLabel = theme.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "w-full max-w-md mx-auto rounded-3xl border-2 p-6 shadow-lg overflow-hidden relative",
        isGold
          ? "border-amber-300 bg-gradient-to-br from-amber-50/80 via-yellow-50/60 to-amber-50/80"
          : "border-emerald-200 bg-gradient-to-br from-emerald-50/60 via-white to-emerald-50/60"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className={cn(
            "text-[10px] font-bold uppercase tracking-widest mb-1",
            isGold ? "text-amber-500" : "text-emerald-500"
          )}>
            {themeLabel}
          </p>
          <h3 className={cn(
            "text-lg font-black tracking-tight",
            isGold ? "text-amber-900" : "text-slate-900"
          )}>
            {title}
          </h3>
        </div>
        {isGold && (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.4 }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 border border-amber-300 rounded-full"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Perfect</span>
          </motion.div>
        )}
      </div>

      {/* Story Text */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <p className={cn(
          "text-[15px] leading-[1.75] font-medium",
          isGold ? "text-amber-900/90" : "text-slate-700"
        )}>
          {story}
        </p>
      </motion.div>

      {/* Gold shimmer overlay */}
      {isGold && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: '300%' }}
          transition={{ duration: 1.2, delay: 0.5, ease: 'easeInOut' }}
          className="absolute inset-0 w-1/4 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none"
        />
      )}
    </motion.div>
  );
}
