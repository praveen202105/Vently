'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

// Mood categories that match @vently/shared MoodIntent
export type MoodType = 'LONELY' | 'NEED_TO_TALK' | 'FRIENDSHIP' | 'LATE_NIGHT' | 'ADVICE' | 'FLIRTY' | 'VOICE_ONLY';

interface AnimatedBackgroundProps {
  variant?: 'default' | 'welcome' | 'mood';
  mood?: MoodType | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  maxLife: number;
  life: number;
  color: string;
}

export function AnimatedBackground({ variant = 'default', mood = null }: AnimatedBackgroundProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number }>({ x: -1000, y: -1000 });
  const activeMood = mood || (variant === 'mood' ? 'FRIENDSHIP' : null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Canvas particle engine
  useEffect(() => {
    if (reducedMotion || !canvasRef.current || !activeMood) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];
    const maxParticles = 60;

    // Track container dimensions
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth * window.devicePixelRatio;
        canvas.height = parent.clientHeight * window.devicePixelRatio;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Track mouse / touch pointer
    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handlePointerLeave = () => {
      pointerRef.current = { x: -1000, y: -1000 };
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerleave', handlePointerLeave);

    // Particle factory based on mood
    const createParticle = (x?: number, y?: number): Particle => {
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      const px = x ?? Math.random() * w;
      const py = y ?? Math.random() * h;

      let vx = 0;
      let vy = 0;
      let size = 2;
      let alpha = 0.3 + Math.random() * 0.5;
      let maxLife = 100 + Math.random() * 200;
      let color = 'rgba(255, 255, 255, ';

      switch (activeMood) {
        case 'LONELY':
          // Falling droplets
          vx = (Math.random() - 0.5) * 0.2;
          vy = 1 + Math.random() * 1.5;
          size = 1 + Math.random() * 2;
          color = 'rgba(165, 180, 252, '; // indigo tint
          break;
        case 'FLIRTY':
          // Rising sparks
          vx = (Math.random() - 0.5) * 1.2;
          vy = -(1 + Math.random() * 2);
          size = 2 + Math.random() * 3;
          color = 'rgba(244, 63, 94, '; // hot-pink/rose sparks
          break;
        case 'FRIENDSHIP':
          // Slow floating bubbles
          vx = (Math.random() - 0.5) * 0.4;
          vy = -(0.3 + Math.random() * 0.5);
          size = 4 + Math.random() * 6;
          color = 'rgba(52, 211, 153, '; // teal/emerald
          break;
        case 'NEED_TO_TALK':
          // Flowing drift
          vx = 0.5 + Math.random() * 1;
          vy = (Math.random() - 0.5) * 0.3;
          size = 2 + Math.random() * 2;
          color = 'rgba(56, 189, 248, '; // sky blue
          break;
        default:
          // Standard white dust
          vx = (Math.random() - 0.5) * 0.5;
          vy = (Math.random() - 0.5) * 0.5;
          size = 1 + Math.random() * 2;
          color = 'rgba(255, 255, 255, ';
      }

      return {
        x: px,
        y: py,
        vx,
        vy,
        size,
        alpha,
        maxLife,
        life: 0,
        color,
      };
    };

    // Initialize particles
    for (let i = 0; i < maxParticles; i++) {
      particles.push(createParticle());
    }

    // Animation Loop
    const tick = () => {
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      ctx.clearRect(0, 0, w, h);

      const pointer = pointerRef.current;

      // Draw background glow overlay grids
      particles.forEach((p, idx) => {
        p.life++;

        // Physics: move
        p.x += p.vx;
        p.y += p.vy;

        // Pointer interactions: attraction or repulsion
        if (pointer.x > 0 && pointer.y > 0) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            const force = (150 - dist) / 150;
            if (activeMood === 'FLIRTY') {
              // Attract sparks to pointer
              p.x += (dx / dist) * force * 1.5;
              p.y += (dy / dist) * force * 1.5;
            } else if (activeMood === 'LONELY' || activeMood === 'NEED_TO_TALK') {
              // Repel droplets
              p.x -= (dx / dist) * force * 2.0;
              p.y -= (dy / dist) * force * 2.0;
            }
          }
        }

        // Keep inside boundaries or recycle
        let outOfBounds = false;
        if (activeMood === 'LONELY') {
          if (p.y > h || p.x < -20 || p.x > w + 20) outOfBounds = true;
        } else if (activeMood === 'FLIRTY' || activeMood === 'FRIENDSHIP') {
          if (p.y < -20 || p.x < -20 || p.x > w + 20) outOfBounds = true;
        } else {
          if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) outOfBounds = true;
        }

        if (p.life >= p.maxLife || outOfBounds) {
          particles[idx] = createParticle(
            activeMood === 'LONELY' ? Math.random() * w : undefined,
            activeMood === 'LONELY' ? -10 : h + 10
          );
          return;
        }

        // Draw particle
        const currentAlpha = p.alpha * (1 - p.life / p.maxLife);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${currentAlpha})`;
        ctx.fill();
      });

      animationId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [reducedMotion, activeMood]);

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
        className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full blur-3xl pointer-events-none"
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
        className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-full blur-3xl pointer-events-none"
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
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-pink-600 to-rose-600 rounded-full blur-3xl pointer-events-none"
        />
      )}

      {/* High-fidelity interactive mood canvas particles */}
      {!reducedMotion && activeMood && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-80"
        />
      )}

      {/* Standard lightweight fallback particle boxes */}
      {!reducedMotion && !activeMood && (
        Array.from({ length: 15 }, (_, i) => ({
          left: ((i * 53) % 100) + Math.sin(i) * 5,
          top: ((i * 37) % 100) + Math.cos(i) * 5,
          xOffset: ((i * 7) % 20) - 10,
          duration: 3 + ((i * 11) % 20) / 10,
          delay: ((i * 13) % 20) / 10,
        })).map((p, i) => (
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
            className="absolute w-1 h-1 bg-white rounded-full pointer-events-none"
            style={{ left: `${p.left}%`, top: `${p.top}%` }}
          />
        ))
      )}

      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)] pointer-events-none" />
    </>
  );
}
