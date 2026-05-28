'use client';

import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  AudioLines,
  CloudMoon,
  Coffee,
  Flame,
  HandHelping,
  HeartCrack,
  Mic,
  MessageCircle,
} from 'lucide-react';
import type { MoodIntent } from '@vently/shared';
import { AnimatedBackground, GlassCard } from '@vently/ui';
import { useMatchStore } from '@/stores/match-store';
import { AgeGateModal } from '@/components/safety/age-gate-modal';
import { useState } from 'react';

interface MoodOption {
  id: MoodIntent;
  label: string;
  // Subtitle shown under the label. Defaults to "Connect instantly" for the
  // text moods; VOICE_ONLY gets its own copy so the user can see at pick-time
  // that they're choosing a voice call, not a text chat.
  subtitle: string;
  icon: typeof HeartCrack;
  gradient: string;
}

const MOODS: MoodOption[] = [
  { id: 'LONELY', label: 'Feeling lonely', subtitle: 'Connect instantly', icon: HeartCrack, gradient: 'from-purple-500 to-pink-500' },
  { id: 'NEED_TO_TALK', label: 'Need to talk', subtitle: 'Connect instantly', icon: MessageCircle, gradient: 'from-blue-500 to-cyan-500' },
  { id: 'FRIENDSHIP', label: 'Friendship', subtitle: 'Connect instantly', icon: HandHelping, gradient: 'from-emerald-500 to-teal-500' },
  { id: 'LATE_NIGHT', label: 'Late night talk', subtitle: 'Connect instantly', icon: CloudMoon, gradient: 'from-indigo-500 to-violet-500' },
  { id: 'ADVICE', label: 'Need advice', subtitle: 'Connect instantly', icon: Coffee, gradient: 'from-amber-500 to-orange-500' },
  { id: 'FLIRTY', label: 'Flirty chat', subtitle: 'Connect instantly', icon: Flame, gradient: 'from-rose-500 to-red-500' },
  { id: 'VOICE_ONLY', label: 'Voice only', subtitle: 'Talk, don’t type', icon: Mic, gradient: 'from-sky-500 to-blue-500' },
];

export function MoodSelectionScreen() {
  const router = useRouter();
  const setMood = useMatchStore((s) => s.setMood);
  const reduceMotion = useReducedMotion();

  // Age gate state — which mood is pending confirmation (if any).
  const [pendingMood, setPendingMood] = useState<MoodIntent | null>(null);
  const pendingOption = MOODS.find((m) => m.id === pendingMood) ?? null;

  // Moods that require the age gate / content advisory before joining the queue.
  const GATED_MOODS = new Set<MoodIntent>(['FLIRTY', 'LATE_NIGHT']);

  const pick = (mood: MoodIntent) => {
    if (GATED_MOODS.has(mood)) {
      setPendingMood(mood);
      return;
    }
    setMood(mood);
    router.push('/matching');
  };

  const confirmGatedMood = () => {
    if (!pendingMood) return;
    setMood(pendingMood);
    setPendingMood(null);
    router.push('/matching');
  };

  return (
    <div className="min-h-screen relative overflow-hidden p-6">
      <AnimatedBackground variant="mood" />

      <div className="relative z-10 max-w-2xl mx-auto pt-8">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl md:text-4xl text-center mb-2 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent"
        >
          How are you feeling?
        </motion.h1>
        <p className="text-center text-muted-foreground text-sm mb-10">
          Pick a vibe — we&apos;ll match you with someone in the same mood.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MOODS.map((mood, i) => {
            const Icon = mood.icon;
            const isVoice = mood.id === 'VOICE_ONLY';
            return (
              <motion.button
                key={mood.id}
                type="button"
                onClick={() => pick(mood.id)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="text-left"
              >
                <GlassCard
                  className={`p-5 hover:border-primary/40 transition-colors relative ${
                    isVoice ? 'ring-1 ring-sky-500/30' : ''
                  }`}
                >
                  {/* Voice-only gets a small corner chip so users can see at a
                      glance that this option leads to a voice call, not text. */}
                  {isVoice && (
                    <span className="absolute top-2 right-3 text-[10px] uppercase tracking-wider text-sky-400 flex items-center gap-1">
                      <AudioLines className="w-3 h-3" />
                      Voice call
                    </span>
                  )}
                  <div className="flex items-center gap-4">
                    <motion.div
                      // Pulsing mic for the voice tile makes the affordance feel
                      // alive — guarded by reduceMotion per the global rule.
                      animate={
                        isVoice && !reduceMotion ? { scale: [1, 1.08, 1] } : undefined
                      }
                      transition={
                        isVoice && !reduceMotion
                          ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                          : undefined
                      }
                      className={`p-3 rounded-xl bg-gradient-to-br ${mood.gradient} shadow-lg`}
                    >
                      <Icon className="w-6 h-6 text-white" />
                    </motion.div>
                    <div>
                      <p className="text-base">{mood.label}</p>
                      <p className="text-xs text-muted-foreground">{mood.subtitle}</p>
                    </div>
                  </div>
                </GlassCard>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Age gate modal for FLIRTY / LATE_NIGHT moods */}
      <AgeGateModal
        open={pendingMood !== null}
        moodLabel={pendingOption?.label ?? ''}
        onConfirm={confirmGatedMood}
        onCancel={() => setPendingMood(null)}
      />
    </div>
  );
}
