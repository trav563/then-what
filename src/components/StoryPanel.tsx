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
  isTrueStory?: boolean;
  funFact?: string;
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

export function StoryPanel({ cards, correctOrder, title, theme, isGold, storyText, isTrueStory, funFact }: StoryPanelProps) {
  const story = storyText || stitchStory(cards, correctOrder);
  const themeLabel = theme.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const panelVariants = {
    hidden: { opacity: 0, scale: 0.85, y: 40 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { 
        type: "spring", 
        stiffness: 280, 
        damping: 22, 
        staggerChildren: 0.15, 
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 350, damping: 25 } }
  };

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        "w-full max-w-md mx-auto rounded-3xl border p-7 shadow-2xl overflow-hidden relative",
        isGold
          ? "border-[#D4AF37]/60 bg-gradient-to-br from-[#FFFDF8] via-[#FFF9EA] to-[#FFFDF8] shadow-[#D4AF37]/20"
          : "border-emerald-200 bg-gradient-to-br from-emerald-50/60 via-white to-emerald-50/60 shadow-emerald-900/5"
      )}
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-widest",
              isGold ? "text-[#B5911C]" : "text-emerald-500"
            )}>
              {themeLabel}
            </p>
            {isTrueStory && (
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-widest",
                isGold ? "bg-[#DEB841]/20 text-[#A88210]" : "bg-indigo-100 text-indigo-700"
              )}>
                True Story
              </span>
            )}
          </div>
          <h3 className={cn(
            "text-xl font-black tracking-tight",
            isGold ? "text-slate-900" : "text-slate-900"
          )}>
            {title}
          </h3>
        </div>
        {isGold && (
          <motion.div
            variants={itemVariants}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF6E0] border border-[#DEB841] rounded-full shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#C19B2E]" />
            <span className="text-[11px] font-bold text-[#A88210] uppercase tracking-wider">Perfect</span>
          </motion.div>
        )}
      </motion.div>

      {/* Story Text */}
      <motion.div variants={itemVariants}>
        <p className={cn(
          "text-[16px] leading-[1.8] font-medium",
          isGold ? "text-[#5C4D26]" : "text-slate-700"
        )}>
          {story}
        </p>
      </motion.div>

      {/* Optional Trivia or Epilogue section */}
      {!isTrueStory && funFact && (
        <motion.div variants={itemVariants} className={cn(
          "mt-5 pt-4 border-t text-sm relative z-10",
          isGold ? "border-[#D4AF37]/20" : "border-slate-200/60"
        )}>
          <p className={cn(
            "font-bold flex items-center gap-1.5 mb-1",
            isGold ? "text-[#A88210]" : "text-slate-700"
          )}>
            <span className="text-amber-500 text-lg leading-none">💡</span> Did you know?
          </p>
          <p className={cn(
            "leading-relaxed font-medium",
            isGold ? "text-[#8A6C11]" : "text-slate-600"
          )}>
            {funFact}
          </p>
        </motion.div>
      )}

      {isTrueStory && funFact && (
        <motion.div variants={itemVariants} className={cn(
          "mt-5 pt-4 border-t text-sm relative z-10",
           isGold ? "border-[#D4AF37]/20 text-[#8A6C11]" : "border-slate-200/60 text-slate-500"
        )}>
          <p className="leading-relaxed font-medium italic">
            <span className="font-bold not-italic">Fun Fact: </span>{funFact}
          </p>
        </motion.div>
      )}

      {/* Elegant Gold Shimmer overlay */}
      {isGold && (
        <motion.div
          initial={{ x: '-100%', opacity: 0 }}
          animate={{ x: '300%', opacity: 1 }}
          transition={{ duration: 2, delay: 0.8, ease: 'easeInOut' }}
          className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none z-0"
        />
      )}
    </motion.div>
  );
}
