'use client';

import { cn } from '../lib/cn';

interface SkeletonProps {
  className?: string;
  /** Shape preset: rounded rectangle (default), circle, or a single text line. */
  shape?: 'rect' | 'circle' | 'line';
}

// Shimmer block. Animation is keyframe-based via tailwind's `animate-pulse`,
// which is itself wrapped by the prefers-reduced-motion guard added to
// globals.css — so users who opted out of motion get a static dim block.
export function Skeleton({ className, shape = 'rect' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-muted/40 animate-pulse',
        shape === 'circle' && 'rounded-full',
        shape === 'rect' && 'rounded-xl',
        shape === 'line' && 'rounded-md h-3',
        className,
      )}
    />
  );
}
