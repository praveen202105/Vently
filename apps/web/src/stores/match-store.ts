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
  setMood: (mood: MoodIntent) => void;
  setQueued: () => void;
  setMatched: (payload: { conversationId: string; peer: MatchPeer }) => void;
  setTimeout: () => void;
  reset: () => void;
}

export const useMatchStore = create<MatchState>((set) => ({
  status: 'idle',
  mood: null,
  conversationId: null,
  peer: null,
  setMood: (mood) => set({ mood }),
  setQueued: () => set({ status: 'queued' }),
  setMatched: ({ conversationId, peer }) => set({ status: 'matched', conversationId, peer }),
  setTimeout: () => set({ status: 'timeout' }),
  reset: () => set({ status: 'idle', mood: null, conversationId: null, peer: null }),
}));
