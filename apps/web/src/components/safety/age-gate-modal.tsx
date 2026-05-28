'use client';

import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  open: boolean;
  moodLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Age gate / content advisory modal shown before joining FLIRTY or LATE_NIGHT
 * match queues. Requires explicit confirmation before proceeding.
 *
 * Design rationale: a modal forces an intentional tap rather than an accidental
 * swipe. The content warning copy is non-judgmental and privacy-focused.
 */
export function AgeGateModal({ open, moodLabel, onConfirm, onCancel }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />

          {/* Modal sheet */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 60, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed inset-x-4 bottom-6 z-50 max-w-sm mx-auto rounded-3xl border border-glass-border bg-glass-bg backdrop-blur-2xl shadow-2xl shadow-black/40 overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="age-gate-title"
          >
            {/* Gradient accent line */}
            <div className="h-1 w-full bg-gradient-to-r from-rose-500 via-pink-500 to-orange-500" />

            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/20">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <h2 id="age-gate-title" className="text-base font-semibold text-foreground">
                      Content Advisory
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{moodLabel} mode</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  className="p-1.5 rounded-xl text-muted-foreground hover:bg-muted/40 transition"
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                This mood may connect you with conversations of a mature or sensitive nature.
              </p>
              <ul className="text-sm text-muted-foreground space-y-1.5 mb-5 pl-4">
                <li className="list-disc">
                  You must be <span className="text-foreground font-medium">18 years or older</span>{' '}
                  to continue.
                </li>
                <li className="list-disc">
                  Conversations are anonymous but not private from moderation.
                </li>
                <li className="list-disc">You can report or block at any time.</li>
              </ul>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 py-3 rounded-2xl bg-muted/60 text-muted-foreground hover:bg-muted transition text-sm font-medium"
                >
                  Go back
                </button>
                <motion.button
                  type="button"
                  onClick={onConfirm}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-medium text-sm shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 transition-shadow"
                >
                  I confirm, I'm 18+
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
