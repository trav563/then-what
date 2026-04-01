import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { cn } from './Card';

interface NarrativeStitchProps {
  cards: { id: string; text: string }[];
  correctOrder: string[];
  title: string;
  theme: string;
  storyText?: string;
  isGold: boolean;
  isVisible: boolean;
  isTrueStory?: boolean;
  funFact?: string;
}

/**
 * NarrativeStitch: THE final story view for wins.
 * 
 * This component IS the end state — it does NOT get replaced by StoryPanel.
 * 
 * Phase 1 (cards): Individual card texts shown with separator lines
 * Phase 2 (collapsing): Gaps shrink, separators dissolve
 * Phase 3 (crossfade): Card text fades out, storyText fades in
 * Phase 4 (complete): Header (title, theme, badges) and footer (fun fact) fade in
 */
export function NarrativeStitch({ cards, correctOrder, title, theme, storyText, isGold, isVisible, isTrueStory, funFact }: NarrativeStitchProps) {
  const [phase, setPhase] = useState<'cards' | 'collapsing' | 'crossfade' | 'complete'>('cards');

  const orderedTexts = correctOrder.map(id => {
    const card = cards.find(c => c.id === id);
    return card?.text || '';
  });

  // Light stitching fallback if no storyText
  const stitchedFallback = orderedTexts
    .map(t => t.trim())
    .map(t => {
      if (!t.endsWith('.') && !t.endsWith('!') && !t.endsWith('?') && !t.endsWith('…')) {
        return t + '.';
      }
      return t;
    })
    .join(' ');

  const finalStory = storyText || stitchedFallback;
  const themeLabel = theme.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  useEffect(() => {
    if (!isVisible) {
      setPhase('cards');
      return;
    }

    // Phase transitions
    const t1 = setTimeout(() => setPhase('collapsing'), 500);
    const t2 = setTimeout(() => setPhase('crossfade'), 1300);
    const t3 = setTimeout(() => setPhase('complete'), 2200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const isCollapsed = phase === 'collapsing' || phase === 'crossfade' || phase === 'complete';
  const showFinalText = phase === 'crossfade' || phase === 'complete';
  const showChrome = phase === 'complete';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="w-full max-w-md mx-auto"
    >
      <div
        className={cn(
          "rounded-3xl border overflow-hidden relative transition-all duration-700",
          isGold
            ? "border-[#D4AF37]/60 bg-gradient-to-br from-[#FFFDF8] via-[#FFF9EA] to-[#FFFDF8] shadow-2xl shadow-[#D4AF37]/20"
            : "border-emerald-200 bg-gradient-to-br from-emerald-50/60 via-white to-emerald-50/60 shadow-2xl shadow-emerald-900/5"
        )}
      >
        {/* Header — fades in after crossfade */}
        <motion.div
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{
            opacity: showChrome ? 1 : 0,
            height: showChrome ? 'auto' : 0,
            marginBottom: showChrome ? 0 : 0,
          }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="px-7 pt-7 pb-0">
            <div className="flex items-center justify-between mb-5">
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
                <h3 className="text-xl font-black tracking-tight text-slate-900">
                  {title}
                </h3>
              </div>
              {isGold && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF6E0] border border-[#DEB841] rounded-full shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-[#C19B2E]" />
                  <span className="text-[11px] font-bold text-[#A88210] uppercase tracking-wider">Perfect</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Story body — the core transition area */}
        <div className="relative px-7">
          {/* Layer 1: Individual card texts (fades out during crossfade) */}
          <motion.div
            animate={{ opacity: showFinalText ? 0 : 1 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            className={showFinalText ? "absolute inset-x-0 px-7" : "relative"}
          >
            {orderedTexts.map((text, i) => (
              <motion.div
                key={i}
                animate={{
                  paddingTop: isCollapsed ? (i === 0 && !showChrome ? 24 : 2) : 10,
                  paddingBottom: isCollapsed ? (i === orderedTexts.length - 1 ? 24 : 2) : 10,
                }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className={cn(
                  "text-[15px] font-medium leading-relaxed",
                  isGold ? "text-[#5C4D26]" : "text-emerald-900"
                )}>
                  {text}
                </p>
                {/* Separator line between cards */}
                {i < orderedTexts.length - 1 && (
                  <motion.div
                    animate={{
                      opacity: isCollapsed ? 0 : 0.25,
                      marginTop: isCollapsed ? 0 : 8,
                      height: isCollapsed ? 0 : 1,
                    }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className={cn(
                      isGold ? "bg-[#D4AF37]" : "bg-emerald-300"
                    )}
                  />
                )}
              </motion.div>
            ))}
          </motion.div>

          {/* Layer 2: Final story text (fades in during crossfade) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: showFinalText ? 1 : 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            className={cn(
              showFinalText ? "relative" : "absolute inset-x-0 px-7",
              "py-1"
            )}
          >
            <p className={cn(
              "text-[16px] leading-[1.8] font-medium",
              isGold ? "text-[#5C4D26]" : "text-slate-700"
            )}>
              {finalStory}
            </p>
          </motion.div>
        </div>

        {/* Gold shimmer overlay */}
        {isGold && showChrome && (
          <motion.div
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: '300%', opacity: 1 }}
            transition={{ duration: 2, delay: 0.3, ease: 'easeInOut' }}
            className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none z-0"
          />
        )}

        {/* Fun fact / trivia footer — fades in with chrome */}
        {funFact && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{
              opacity: showChrome ? 1 : 0,
              height: showChrome ? 'auto' : 0,
            }}
            transition={{ duration: 0.8, delay: showChrome ? 0.5 : 0, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className={cn(
              "mx-7 mb-7 mt-4 pt-5 border-t text-sm relative z-10",
              isGold ? "border-[#D4AF37]/20" : "border-slate-200/80"
            )}>
              {isTrueStory ? (
                <p className={cn(
                  "leading-relaxed font-medium italic",
                  isGold ? "text-[#8A6C11]" : "text-slate-500"
                )}>
                  <span className="font-bold not-italic text-slate-700">Fun Fact: </span>{funFact}
                </p>
              ) : (
                <>
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
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
