import React from 'react';
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
          {text}
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

export const LockedCard: React.FC<Omit<CardProps, 'isLocked'>> = ({ id, text }) => {
  return (
    <motion.div
      initial={{ scale: 0.98, opacity: 0.5 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative flex items-center p-4 mb-3 rounded-2xl border-2 bg-emerald-50/40 border-emerald-200"
    >
      <div className="flex-1 pr-4">
        <p className="text-[15px] font-medium leading-relaxed text-emerald-900">
          {text}
        </p>
      </div>
      
      <motion.div 
        initial={{ scale: 0, opacity: 0, rotate: -45 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 25, delay: 0.15 }}
        className="flex-shrink-0 w-8 flex justify-center items-center"
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
      </motion.div>
    </motion.div>
  );
};
