'use client';

import { useEffect, useRef } from 'react';

/**
 * Plays a synthesized phone ringtone via the Web Audio API while `active` is
 * true. No assets to bundle. Two variants:
 *
 *   - outgoing → classic "ringback" the caller hears (1s of tone, 3s silence)
 *   - incoming → more urgent two-burst pattern for the callee
 *
 * Modern browsers gate AudioContext until a user gesture. The caller's
 * phone-icon click counts; the callee gets sound the moment any interaction
 * has happened on the page (typical after navigating into the app). If the
 * context is blocked, the tone is silently skipped — the visible UI still
 * conveys the call state.
 */

type Variant = 'outgoing' | 'incoming';

interface Schedule {
  /** Frequency of the sine tone in Hz. */
  freq: number;
  /** [onSeconds, offSeconds, onSeconds, offSeconds, …] cycle. */
  cycle: number[];
  /** Peak gain (0-1). */
  peak: number;
}

const SCHEDULES: Record<Variant, Schedule> = {
  // Classic US/EU ringback: 440+480 Hz mixed, on 1.0s / off 3.0s.
  // We approximate with one tone for simplicity.
  outgoing: { freq: 440, cycle: [1.0, 3.0], peak: 0.15 },
  // Two short bursts then a pause — feels like an incoming phone alert.
  incoming: { freq: 660, cycle: [0.4, 0.2, 0.4, 1.8], peak: 0.25 },
};

export function useRingtone(active: boolean, variant: Variant = 'outgoing') {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) {
      stopRef.current?.();
      stopRef.current = null;
      return;
    }
    if (typeof window === 'undefined') return;

    let cancelled = false;
    try {
      // Lazily create the AudioContext. Reuse across mounts to avoid hitting
      // browser AudioContext quotas.
      const Ctx =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = ctxRef.current ?? new Ctx();
      ctxRef.current = ctx;

      // Some browsers suspend the context after creation; resume on demand.
      // If the user hasn't gestured yet, this rejects silently — the
      // schedule still runs but with no audible output. That's acceptable.
      void ctx.resume().catch(() => undefined);

      const schedule = SCHEDULES[variant];
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      gainRef.current = gain;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = schedule.freq;
      osc.connect(gain);
      osc.start();
      oscRef.current = osc;

      const start = ctx.currentTime;
      const totalCycle = schedule.cycle.reduce((a, b) => a + b, 0);
      // Schedule enough cycles to cover ~2 minutes — way more than any sane
      // ring duration. The cleanup below interrupts cleanly.
      const cycleCount = Math.ceil(120 / totalCycle);
      for (let i = 0; i < cycleCount; i++) {
        let t = start + i * totalCycle;
        for (let j = 0; j < schedule.cycle.length; j++) {
          const duration = schedule.cycle[j] ?? 0;
          const on = j % 2 === 0;
          if (on) {
            // Fade in/out so we don't pop the speakers.
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(schedule.peak, t + 0.05);
            gain.gain.setValueAtTime(schedule.peak, t + duration - 0.05);
            gain.gain.linearRampToValueAtTime(0, t + duration);
          }
          t += duration;
        }
      }

      stopRef.current = () => {
        if (cancelled) return;
        cancelled = true;
        try {
          gain.gain.cancelScheduledValues(ctx.currentTime);
          gain.gain.setValueAtTime(0, ctx.currentTime);
          osc.stop(ctx.currentTime + 0.05);
        } catch {
          // ignore — node may already be stopped
        }
        oscRef.current = null;
        gainRef.current = null;
      };
    } catch {
      // AudioContext can throw on iOS in some lock-screen states. Fail silent.
    }

    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [active, variant]);
}
