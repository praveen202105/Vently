'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { AudioLines, Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { GlassCard } from '@vently/ui';
import { useAuthStore } from '@/stores/auth-store';
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
  const ringerIncoming = search.get('incoming') === '1';
  const voiceOnly = search.get('voice-only') === '1';
  const peer = useMatchStore((s) => s.peer);
  const me = useAuthStore((s) => s.user);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const reduceMotion = useReducedMotion();

  // For a voice-only direct match BOTH sides land here at the same time and
  // need to pick a role without a handshake. Lower userId is the caller — a
  // deterministic, lexicographic compare both clients can compute locally.
  // Falls back to a coin flip via `String.localeCompare` so we don't end up
  // with two callers (which the pcRef guard would catch anyway, but cleaner
  // to never get there). If peer hasn't loaded yet, default to false so we
  // stay in IDLE until match-store hydrates.
  const isVoiceOnlyCaller = voiceOnly && !!me && !!peer && me.id < peer.userId;
  const isVoiceOnlyCallee = voiceOnly && !!me && !!peer && me.id >= peer.userId;
  // The underlying WebRTC machine only knows "caller" (isIncoming=false) and
  // "callee" (isIncoming=true). Map our richer state to that contract.
  const isIncoming = ringerIncoming || isVoiceOnlyCallee;

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

  // Auto-start the call when we open the screen as the caller. Covers two
  // paths: (a) classic — user tapped the Phone icon in chat header, so they
  // mean to call; (b) voice-only match — we landed here with `voice-only=1`
  // and our userId is the lower of the pair (deterministic caller role).
  // One-shot via ref so a socket reconnect (which rebuilds `startCall`'s
  // identity through useCallback's deps) doesn't fire a second CALL_INVITE.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    // Voice-only: only the deterministically-chosen caller auto-starts.
    if (voiceOnly && !isVoiceOnlyCaller) return;
    if (callState === 'IDLE' && !isIncoming) {
      autoStartedRef.current = true;
      void startCall();
    }
  }, [callState, isIncoming, startCall, voiceOnly, isVoiceOnlyCaller]);

  // Voice-only callee: auto-accept the call instead of showing the green/red
  // ringer banner. The peer is the deterministic caller and will fire
  // CALL_INVITE within a few ms; acceptCall creates our PC + emits CALL_ACCEPT
  // which kicks the caller into createOffer (see use-webrtc.ts onAccept).
  // We don't need to wait for CALL_INVITE — acceptCall is safe to call before
  // the invite arrives because it only sets up the receiving side.
  const autoAcceptedRef = useRef(false);
  useEffect(() => {
    if (autoAcceptedRef.current) return;
    if (!isVoiceOnlyCallee) return;
    if (callState !== 'RINGING') return;
    autoAcceptedRef.current = true;
    void acceptCall();
  }, [isVoiceOnlyCallee, callState, acceptCall]);

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

  const visualizerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (callState !== 'CONNECTED' || !remoteStream || !visualizerCanvasRef.current) return;

    const canvas = visualizerCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = 240;
    canvas.height = 240;

    let audioCtx: AudioContext;
    let source: MediaStreamAudioSourceNode;
    let analyser: AnalyserNode;
    let animationId: number;

    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      
      source = audioCtx.createMediaStreamSource(remoteStream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        analyser.getByteFrequencyData(dataArray);

        let total = 0;
        for (let i = 0; i < bufferLength; i++) {
          total += dataArray[i] ?? 0;
        }
        const average = total / bufferLength;
        const volumeFactor = average / 255;

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw glowing concentric rings reacting to voice amplitude
        const ringCount = 3;
        for (let r = 1; r <= ringCount; r++) {
          const baseRadius = 80 + r * 15;
          const dynamicRadius = baseRadius + volumeFactor * 25 * r;
          const alpha = (0.4 - r * 0.1) * (0.3 + volumeFactor * 0.7);

          ctx.beginPath();
          ctx.arc(cx, cy, dynamicRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
          ctx.lineWidth = 1 + volumeFactor * 5;
          ctx.stroke();
        }

        animationId = requestAnimationFrame(draw);
      };

      draw();
    } catch (e) {
      console.warn('Web Audio API disabled or blocked:', e);
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (source) source.disconnect();
      if (analyser) analyser.disconnect();
      if (audioCtx) void audioCtx.close();
    };
  }, [callState, remoteStream]);

  // When the call ends we bounce out of the screen. For voice-only matches
  // there's no chat to fall back to (no text was ever exchanged), so go
  // back to /mood so the user can try another match. Classic calls return
  // to the chat thread where they came from.
  useEffect(() => {
    if (callState !== 'ENDED') return;
    const dest = voiceOnly ? '/mood' : `/chat/${conversationId}`;
    const t = setTimeout(() => router.replace(dest), 1000);
    return () => clearTimeout(t);
  }, [callState, router, conversationId, voiceOnly]);

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
    <div className="min-h-dvh flex flex-col items-center justify-between p-6 text-center">
      {voiceOnly ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4"
        >
          <GlassCard className="px-4 py-2 flex items-center gap-2 text-xs">
            <AudioLines className="w-4 h-4 text-sky-400" />
            <span className="text-muted-foreground">Voice-only match</span>
          </GlassCard>
        </motion.div>
      ) : (
        <div />
      )}

      <div className="flex flex-col items-center gap-6">
        <motion.div
          animate={
            reduceMotion || callState !== 'CONNECTED' ? undefined : { scale: [1, 1.05, 1] }
          }
          transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity }}
          className="relative"
        >
          {!reduceMotion && callState === 'CONNECTED' ? (
            <canvas
              ref={visualizerCanvasRef}
              className="absolute inset-[-40px] w-[240px] h-[240px] rounded-full pointer-events-none z-0"
            />
          ) : (
            <motion.div
              animate={reduceMotion ? undefined : { scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
              transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full bg-primary/40"
            />
          )}
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
              className="p-5 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
            >
              <Phone className="w-7 h-7" />
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
