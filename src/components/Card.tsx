import React, { useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'motion/react';

interface CardProps {
  id: string;
  text: string;
  isLocked: boolean;
  isDragging?: boolean;
  isOverlay?: boolean;
}

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export const SortableCard: React.FC<CardProps> = ({ id, text, isLocked, isDragging, isOverlay }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id, disabled: isLocked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex items-center p-4 mb-3 rounded-2xl border-2 bg-white shadow-sm transition-colors duration-200",
        isLocked ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200",
        isOverlay && "shadow-2xl scale-[1.03] border-slate-900 z-50 rotate-2 bg-white",
        isDragging && !isOverlay && "opacity-0",
        !isLocked && !isDragging && !isOverlay && "hover:border-slate-300"
      )}
    >
      <div className="flex-1 pr-4">
        <p className={cn(
          "text-[15px] font-medium leading-relaxed",
          isLocked ? "text-emerald-900" : "text-slate-700"
        )}>
          {isLocked || text.split(' ').length <= 3 ? text : text.split(' ').slice(0, 3).join(' ') + '...'}
        </p>
      </div>
      
      <div 
        className={cn(
          "flex-shrink-0 w-10 h-10 flex justify-center items-center rounded-lg transition-colors",
          isLocked ? "text-emerald-400" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-grab active:cursor-grabbing touch-none"
        )}
        {...(!isLocked ? attributes : {})}
        {...(!isLocked ? listeners : {})}
      >
        {isLocked ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : (
          <GripVertical className="w-5 h-5" />
        )}
      </div>
    </div>
  );
};

interface LockedCardProps {
  id: string;
  text: string;
  isGold?: boolean;
}

export const LockedCard: React.FC<LockedCardProps> = ({ id, text, isGold }) => {
  useEffect(() => {
    if (navigator.vibrate) navigator.vibrate(15);
  }, []);

  return (
    <motion.div
      initial={{ scale: 0.96, y: 4, opacity: 0.6 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22, mass: 0.8 }}
      className={cn(
        "relative flex items-center p-4 mb-3 rounded-2xl border overflow-hidden",
        isGold
          ? "border-[#D4AF37]/50 bg-gradient-to-r from-[#FFFDF8] via-[#FFF9EC] to-[#FFFDF8] shadow-sm shadow-[#D4AF37]/10"
          : "border-emerald-200 border-2 bg-emerald-50/40"
      )}
    >
      <div className="flex-1 pr-4 overflow-hidden">
        <motion.p
          initial={{ opacity: 0, filter: 'blur(4px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
          className={cn(
            "text-[15px] font-medium leading-relaxed",
            isGold ? "text-[#5A4924]" : "text-emerald-900"
          )}
        >
          {text}
        </motion.p>
      </div>
      
      <motion.div 
        initial={{ scale: 0, opacity: 0, rotate: -90 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.15 }}
        className="flex-shrink-0 w-8 flex justify-center items-center"
      >
        <CheckCircle2 className={cn(
          "w-5 h-5",
          isGold ? "text-[#D4AF37]" : "text-emerald-400"
        )} />
      </motion.div>

      {/* Subtle shimmer sweep for gold */}
      {isGold && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeInOut' }}
          className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"
        />
      )}
    </motion.div>
  );
};
