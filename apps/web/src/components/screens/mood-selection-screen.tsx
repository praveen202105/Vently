'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
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

interface MoodOption {
  id: MoodIntent;
  label: string;
  icon: typeof HeartCrack;
  gradient: string;
}

const MOODS: MoodOption[] = [
  { id: 'LONELY', label: 'Feeling lonely', icon: HeartCrack, gradient: 'from-purple-500 to-pink-500' },
  { id: 'NEED_TO_TALK', label: 'Need to talk', icon: MessageCircle, gradient: 'from-blue-500 to-cyan-500' },
  { id: 'FRIENDSHIP', label: 'Friendship', icon: HandHelping, gradient: 'from-emerald-500 to-teal-500' },
  { id: 'LATE_NIGHT', label: 'Late night talk', icon: CloudMoon, gradient: 'from-indigo-500 to-violet-500' },
  { id: 'ADVICE', label: 'Need advice', icon: Coffee, gradient: 'from-amber-500 to-orange-500' },
  { id: 'FLIRTY', label: 'Flirty chat', icon: Flame, gradient: 'from-rose-500 to-red-500' },
  { id: 'VOICE_ONLY', label: 'Voice only', icon: Mic, gradient: 'from-sky-500 to-blue-500' },
];

export function MoodSelectionScreen() {
  const router = useRouter();
  const setMood = useMatchStore((s) => s.setMood);

  const pick = (mood: MoodIntent) => {
    setMood(mood);
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
                <GlassCard className="p-5 hover:border-primary/40 transition-colors">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-3 rounded-xl bg-gradient-to-br ${mood.gradient} shadow-lg`}
                    >
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-base">{mood.label}</p>
                      <p className="text-xs text-muted-foreground">Connect instantly</p>
                    </div>
                  </div>
                </GlassCard>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
