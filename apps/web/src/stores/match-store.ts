'use client';

import { create } from 'zustand';
import type { MoodIntent, Gender } from '@vently/shared';

type MatchStatus = 'idle' | 'queued' | 'matched' | 'timeout';

interface MatchPeer {
  userId: string;
  nickname: string;
  gender: Gender;
  avatarSeed: string;
}

interface MatchState {
  status: MatchStatus;
  mood: MoodIntent | null;
  conversationId: string | null;
  peer: MatchPeer | null;
  lastMetAt: string | null;
  /** True when the match is an AI fallback peer (userId starts with `ai_`). */
  isAIChat: boolean;
  setMood: (mood: MoodIntent) => void;
  setQueued: () => void;
  setMatched: (payload: {
    conversationId: string;
    peer: MatchPeer;
    lastMetAt?: string | null;
    isAIChat?: boolean;
  }) => void;
  setTimeout: () => void;
  reset: () => void;
}

export const useMatchStore = create<MatchState>((set) => ({
  status: 'idle',
  mood: null,
  conversationId: null,
  peer: null,
  lastMetAt: null,
  isAIChat: false,
  setMood: (mood) => set({ mood }),
  setQueued: () => set({ status: 'queued' }),
  setMatched: ({ conversationId, peer, lastMetAt, isAIChat }) =>
    set({
      status: 'matched',
      conversationId,
      peer,
      lastMetAt: lastMetAt ?? null,
      isAIChat: isAIChat ?? false,
    }),
  setTimeout: () => set({ status: 'timeout' }),
  reset: () =>
    set({
      status: 'idle',
      mood: null,
      conversationId: null,
      peer: null,
      lastMetAt: null,
      isAIChat: false,
    }),
}));
