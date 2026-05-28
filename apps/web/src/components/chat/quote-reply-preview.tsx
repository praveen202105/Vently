'use client';

import { X, Reply } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  replyToBody: string;
  replyToSenderName: string;
  mine?: boolean;
  /** Called when user taps ✕ to cancel reply. Only shown in composer context. */
  onCancel?: () => void;
}

/**
 * Renders the quoted message preview inside a bubble (when `onCancel` is
 * undefined) or above the composer bar (when `onCancel` is provided).
 *
 * The tinted left border colour follows the mine/peer distinction so the
 * sender can always tell at a glance whose message they're quoting.
 */
export function QuoteReplyPreview({ replyToBody, replyToSenderName, mine, onCancel }: Props) {
  const isComposer = !!onCancel;

  if (isComposer) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-start gap-2 px-4 py-2 border-t border-glass-border bg-glass-bg/80 backdrop-blur-xl"
        >
          <Reply className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-violet-400 mb-0.5">{replyToSenderName}</p>
            <p className="text-xs text-muted-foreground truncate">{replyToBody}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition shrink-0"
            aria-label="Cancel reply"
          >
            <X className="w-3 h-3" />
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Inside a message bubble — no cancel button
  return (
    <div
      className={`
        mb-1 px-2 py-1.5 rounded-xl text-xs border-l-2 max-w-full
        ${
          mine
            ? 'bg-white/10 border-white/40 text-white/70'
            : 'bg-muted/40 border-violet-400/60 text-muted-foreground'
        }
      `}
    >
      <p className={`font-medium mb-0.5 ${mine ? 'text-white/90' : 'text-violet-400'}`}>
        {replyToSenderName}
      </p>
      <p className="truncate">{replyToBody}</p>
    </div>
  );
}
