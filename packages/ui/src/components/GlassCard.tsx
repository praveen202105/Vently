'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className, hover = false, onClick }: GlassCardProps) {
  const interactive = hover || !!onClick;

  if (!interactive) {
    return (
      <div
        className={cn(
          'bg-glass-bg backdrop-blur-xl border border-glass-border rounded-2xl shadow-xl transition-all',
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <motion.div
      onClick={onClick}
      whileHover={hover ? { scale: 1.02, y: -2 } : undefined}
      whileTap={hover ? { scale: 0.98 } : undefined}
      className={cn(
        'bg-glass-bg backdrop-blur-xl border border-glass-border rounded-2xl shadow-xl transition-all',
        hover && 'hover:border-primary/30 hover:shadow-2xl cursor-pointer',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
