'use client';

import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

interface AnimatedBackgroundProps {
  variant?: 'default' | 'welcome' | 'mood';
}

export function AnimatedBackground({ variant = 'default' }: AnimatedBackgroundProps) {
  // prefers-reduced-motion: skip the heavy particle layer for users who opt out.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Pre-computed particle seeds so motion is deterministic per-render across
  // SSR + client hydration (Math.random in render would mismatch).
  const particles = Array.from({ length: 20 }, (_, i) => ({
    left: ((i * 53) % 100) + Math.sin(i) * 5,
    top: ((i * 37) % 100) + Math.cos(i) * 5,
    xOffset: ((i * 7) % 20) - 10,
    duration: 3 + ((i * 11) % 20) / 10,
    delay: ((i * 13) % 20) / 10,
  }));

  return (
    <>
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          x: [0, 50, 0],
          y: [0, -30, 0],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{
          duration: variant === 'mood' ? 8 : 10,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full blur-3xl"
      />

      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          x: [0, -50, 0],
          y: [0, 50, 0],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{
          duration: variant === 'mood' ? 10 : 12,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
        className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-full blur-3xl"
      />

      {variant !== 'welcome' && (
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2,
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-pink-600 to-rose-600 rounded-full blur-3xl"
        />
      )}

      {!reducedMotion &&
        particles.map((p, i) => (
          <motion.div
            key={i}
            animate={{
              y: [0, -30, 0],
              x: [0, p.xOffset, 0],
              opacity: [0.1, 0.4, 0.1],
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              delay: p.delay,
            }}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{ left: `${p.left}%`, top: `${p.top}%` }}
          />
        ))}

      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]" />
    </>
  );
}
