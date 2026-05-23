'use client';

import { motion, AnimatePresence } from 'motion/react';

export const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

interface ReactionPickerProps {
  open: boolean;
  onPick: (emoji: ReactionEmoji) => void;
  onClose: () => void;
  /** Render above (default) or below the parent bubble. */
  position?: 'top' | 'bottom';
}

/**
 * Small floating palette of the 6 supported reactions. Shown over a message
 * bubble on hover (desktop) or long-press (mobile). Picks fire onPick AND
 * onClose so the parent can dismiss after a tap.
 */
export function ReactionPicker({ open, onPick, onClose, position = 'top' }: ReactionPickerProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: position === 'top' ? 6 : -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: position === 'top' ? 6 : -6 }}
          transition={{ duration: 0.12 }}
          role="dialog"
          aria-label="Pick a reaction"
          className={`absolute ${
            position === 'top' ? '-top-12' : '-bottom-12'
          } left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full bg-glass-bg backdrop-blur-xl border border-glass-border shadow-xl`}
          // Clicks inside the picker shouldn't propagate to the bubble (which
          // would re-toggle the picker open/closed).
          onClick={(e) => e.stopPropagation()}
        >
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onPick(emoji);
                onClose();
              }}
              aria-label={`React with ${emoji}`}
              className="w-8 h-8 rounded-full hover:bg-muted text-base transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
