'use client';

import { motion, AnimatePresence } from 'motion/react';
import { Languages, RotateCw } from 'lucide-react';

interface Props {
  /** Whether a translation is currently being fetched. */
  loading: boolean;
  /** Whether we currently have a translation and are showing it. */
  showingTranslation: boolean;
  /** The 2-letter ISO 639-1 code detected for the source language (e.g. "es"). */
  detectedLanguage: string | null;
  onTranslate: () => void;
  onToggle: () => void;
}

/**
 * Displayed below peer message bubbles.
 *
 * States:
 *   idle          → "🌐 Translate" button
 *   loading       → spinner
 *   translated    → "Translated · [Show original]" toggle pill
 */
export function TranslateButton({
  loading,
  showingTranslation,
  detectedLanguage,
  onTranslate,
  onToggle,
}: Props) {
  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <motion.span
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/70 px-1 mt-0.5"
          data-testid="translate-loading"
        >
          <RotateCw className="w-3 h-3 animate-spin" />
          Translating…
        </motion.span>
      ) : showingTranslation ? (
        <motion.button
          key="translated"
          type="button"
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 2 }}
          onClick={onToggle}
          className="flex items-center gap-1 text-[10px] text-violet-400/80 hover:text-violet-400 transition-colors px-1 mt-0.5 cursor-pointer"
          data-testid="translate-toggle"
          title="Show original message"
        >
          <Languages className="w-3 h-3" />
          <span>
            Translated
            {detectedLanguage && detectedLanguage !== 'unknown'
              ? ` from ${detectedLanguage.toUpperCase()}`
              : ''}
            {' ·'} <span className="underline underline-offset-2">Show original</span>
          </span>
        </motion.button>
      ) : (
        <motion.button
          key="idle"
          type="button"
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 2 }}
          onClick={onTranslate}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-violet-400/80 transition-colors px-1 mt-0.5 cursor-pointer"
          data-testid="translate-btn"
          title="Translate this message"
        >
          <Languages className="w-3 h-3" />
          Translate
        </motion.button>
      )}
    </AnimatePresence>
  );
}
