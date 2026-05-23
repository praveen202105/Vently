'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { useMatchStore } from '@/stores/match-store';
import { useWebRTC } from '@/lib/webrtc/use-webrtc';
import { useRingtone } from '@/lib/webrtc/use-ringtone';

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export function VoiceCallScreen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const isIncoming = search.get('incoming') === '1';
  const peer = useMatchStore((s) => s.peer);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const {
    callState,
    remoteStream,
    startCall,
    acceptCall,
    hangup,
    toggleMute,
    muted,
    speakerOn,
    toggleSpeaker,
    error,
  } = useWebRTC({ conversationId, isIncoming });

  // Auto-start the call when we open the screen as the caller (non-incoming).
  useEffect(() => {
    if (callState === 'IDLE' && !isIncoming) {
      void startCall();
    }
  }, [callState, isIncoming, startCall]);

  // Ringtone: caller hears ringback in DIALING, callee hears incoming pattern
  // in RINGING. Stops automatically once we move to CONNECTING / CONNECTED.
  useRingtone(callState === 'DIALING', 'outgoing');
  useRingtone(callState === 'RINGING', 'incoming');

  // Bind the remote stream to the <audio> element when it arrives.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = remoteStream;
      audioRef.current.muted = !speakerOn;
      if (remoteStream) void audioRef.current.play().catch(() => undefined);
    }
  }, [remoteStream, speakerOn]);

  // Duration counter while connected.
  useEffect(() => {
    if (callState !== 'CONNECTED') return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [callState]);

  // Bounce back to chat when the call ends.
  useEffect(() => {
    if (callState !== 'ENDED') return;
    const t = setTimeout(() => router.replace(`/chat/${conversationId}`), 1000);
    return () => clearTimeout(t);
  }, [callState, router, conversationId]);

  const statusLabel =
    callState === 'IDLE'
      ? 'Preparing…'
      : callState === 'DIALING'
      ? 'Ringing…'
      : callState === 'RINGING'
      ? 'Incoming call'
      : callState === 'CONNECTING'
      ? 'Connecting…'
      : callState === 'CONNECTED'
      ? formatDuration(elapsed)
      : 'Call ended';

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-6 text-center">
      <div />

      <div className="flex flex-col items-center gap-6">
        <motion.div
          animate={callState === 'CONNECTED' ? { scale: [1, 1.05, 1] } : undefined}
          transition={{ duration: 2, repeat: Infinity }}
          className="relative"
        >
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full bg-primary/40"
          />
          <div className="relative w-40 h-40 rounded-full bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 flex items-center justify-center text-white text-5xl shadow-2xl">
            {peer?.nickname[0]?.toUpperCase() ?? '?'}
          </div>
        </motion.div>

        <div aria-live="assertive">
          <h1 className="text-2xl">{peer?.nickname ?? 'Stranger'}</h1>
          <p className="text-muted-foreground text-sm mt-1">{statusLabel}</p>
        </div>

        {error && <p className="text-destructive text-sm max-w-xs">{error}</p>}

        <audio ref={audioRef} autoPlay playsInline />
      </div>

      <div className="flex items-center justify-center gap-5">
        {callState === 'RINGING' ? (
          <>
            <button
              type="button"
              onClick={hangup}
              aria-label="Reject"
              className="p-5 rounded-full bg-destructive text-destructive-foreground shadow-lg"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
            <button
              type="button"
              onClick={acceptCall}
              aria-label="Accept"
              className="p-5 rounded-full bg-emerald-500 text-white shadow-lg"
            >
              <Mic className="w-7 h-7" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="p-4 rounded-full bg-glass-bg border border-glass-border backdrop-blur-xl"
            >
              {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <button
              type="button"
              onClick={hangup}
              aria-label="Hang up"
              className="p-5 rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
            <button
              type="button"
              onClick={toggleSpeaker}
              aria-label={speakerOn ? 'Speaker off' : 'Speaker on'}
              className="p-4 rounded-full bg-glass-bg border border-glass-border backdrop-blur-xl"
            >
              {speakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
