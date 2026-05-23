'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button, GlassCard } from '@vently/ui';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). Defaults to true since
   *  every current caller (block, logout) is irreversible from this surface. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Disable the confirm button while a parent action is in flight. */
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  // Close on Esc so keyboard users can dismiss without hunting for Cancel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby={description ? 'confirm-desc' : undefined}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm"
          >
            <GlassCard className="p-6">
              <h2 id="confirm-title" className="text-lg mb-2">
                {title}
              </h2>
              {description && (
                <p id="confirm-desc" className="text-sm text-muted-foreground mb-5">
                  {description}
                </p>
              )}
              <div className="flex gap-3">
                <Button variant="ghost" size="md" className="flex-1" onClick={onCancel}>
                  {cancelLabel}
                </Button>
                {destructive ? (
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={busy}
                    autoFocus
                    className="flex-1 rounded-2xl px-6 py-3 text-base font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy ? '…' : confirmLabel}
                  </button>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    className="flex-1"
                    onClick={onConfirm}
                    disabled={busy}
                  >
                    {busy ? '…' : confirmLabel}
                  </Button>
                )}
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
