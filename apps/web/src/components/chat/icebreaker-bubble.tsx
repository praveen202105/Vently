'use client';

import { motion, AnimatePresence } from 'motion/react';

interface Props {
  chunks: string[];
  done: boolean;
}

export function IcebreakerBubble({ chunks, done }: Props) {
  const text = chunks.join('');

  // Hide once the server has emitted CHAT_ICEBREAKER_DONE and the persisted
  // CHAT_MESSAGE has landed in the message list. We delay the exit so the user
  // can finish reading the line before the bubble swaps out.
  if (!text) return null;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          data-testid="icebreaker-bubble"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.4 } }}
          className="mx-auto my-2 max-w-sm rounded-2xl bg-violet-500/10 border border-violet-500/20 px-4 py-3 text-center"
        >
          <span className="block text-[10px] uppercase tracking-widest text-violet-400 mb-1.5 font-medium">
            Vently suggests
          </span>
          <p className="text-sm text-violet-200 leading-relaxed">
            {text}
            <span className="ml-0.5 inline-block h-3.5 w-[2px] rounded-full animate-pulse bg-violet-300 align-middle" />
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
