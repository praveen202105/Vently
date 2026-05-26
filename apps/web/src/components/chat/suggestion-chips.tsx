'use client';

import { motion, AnimatePresence } from 'motion/react';

interface Props {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export function SuggestionChips({ suggestions, onSelect }: Props) {
  if (suggestions.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8, transition: { duration: 0.2 } }}
        // Outer div: only handles scroll — never justify-center here or
        // overflowing chips get clipped on the left and become unreachable.
        className="w-full overflow-x-auto scrollbar-none py-2"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Inner div: w-max + mx-auto centers chips when they fit,
            and lets them extend beyond the viewport when they don't. */}
        <div className="flex gap-2 px-4 w-max mx-auto">
          {suggestions.map((text, i) => (
            <motion.button
              key={text}
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.06 } }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(text)}
              className="shrink-0 text-xs px-4 py-2 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/50 transition-colors cursor-pointer whitespace-nowrap"
            >
              {text}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
