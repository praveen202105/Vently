'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  AudioLines,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CallMode } from '@vently/shared';
import { useAuthStore } from '@/stores/auth-store';
import { useMatchStore } from '@/stores/match-store';
import { useWebRTC } from '@/lib/webrtc/use-webrtc';
import { useRingtone } from '@/lib/webrtc/use-ringtone';

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function callModeFromParams(
  search: ReturnType<typeof useSearchParams>,
  voiceOnly: boolean,
): CallMode {
  if (voiceOnly) return 'voice';
  return search.get('mode') === 'video' ? 'video' : 'voice';
}

function IncomingCallSlider({
  isVideo,
  onAccept,
  onReject,
}: {
  isVideo: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragXRef = useRef(0);
  const startXRef = useRef(0);
  const startDragXRef = useRef(0);
  const maxDragRef = useRef(120);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const setDrag = (next: number) => {
    const max = maxDragRef.current;
    const clamped = Math.max(-max, Math.min(max, next));
    dragXRef.current = clamped;
    setDragX(clamped);
  };

  const reset = () => setDrag(0);

  const triggerFromDrag = () => {
    const max = maxDragRef.current;
    const threshold = max * 0.72;
    const current = dragXRef.current;
    if (current >= threshold) {
      onAccept();
      return;
    }
    if (current <= -threshold) {
      onReject();
      return;
    }
    reset();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    maxDragRef.current = Math.max(72, rect.width / 2 - 48);
    startXRef.current = event.clientX;
    startDragXRef.current = dragXRef.current;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDrag(startDragXRef.current + event.clientX - startXRef.current);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    triggerFromDrag();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onAccept();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onReject();
    } else if (event.key === 'Escape') {
      reset();
    }
  };

  const progress = Math.min(1, Math.abs(dragX) / maxDragRef.current);
  const isRejectIntent = dragX < -12;

  return (
    <div
      ref={trackRef}
      data-testid="incoming-call-slider"
      className="relative mx-auto h-20 w-full max-w-md select-none overflow-hidden rounded-full border border-white/10 bg-[#111b21]/90 shadow-2xl backdrop-blur-xl touch-none"
    >
      <div
        className={`absolute inset-y-0 transition-opacity ${
          dragX > 0 ? 'right-0 bg-emerald-500/20' : 'left-0 bg-red-500/20'
        }`}
        style={{ width: `${Math.round(progress * 50)}%`, opacity: progress }}
      />
      <button
        type="button"
        onClick={onReject}
        aria-label="Reject"
        className="absolute left-3 top-1/2 z-10 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/25 transition hover:bg-red-500"
      >
        <PhoneOff className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={onAccept}
        aria-label="Accept"
        className="absolute right-3 top-1/2 z-10 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400"
      >
        <Phone className="h-6 w-6" />
      </button>
      <div className="absolute inset-0 grid place-items-center text-xs font-medium uppercase tracking-[0.22em] text-white/45">
        <span aria-hidden="true">{isVideo ? 'Video call' : 'Voice call'}</span>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Incoming call slider"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={Math.round((dragX / maxDragRef.current) * 100)}
        data-testid="incoming-call-thumb"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
        className={`absolute left-1/2 top-1/2 z-20 grid h-16 w-16 cursor-grab place-items-center rounded-full text-white shadow-2xl outline-none ring-offset-2 ring-offset-[#111b21] transition focus-visible:ring-2 focus-visible:ring-white/70 active:cursor-grabbing ${
          isRejectIntent ? 'bg-red-600 shadow-red-600/35' : 'bg-emerald-500 shadow-emerald-500/35'
        }`}
        style={{
          transform: `translate(calc(-50% + ${dragX}px), -50%) scale(${dragging ? 1.05 : 1})`,
          transitionDuration: dragging ? '0ms' : undefined,
        }}
      >
        {isRejectIntent ? <PhoneOff className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
      </div>
    </div>
  );
}

export function CallScreen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const ringerIncoming = search.get('incoming') === '1';
  const voiceOnly = search.get('voice-only') === '1';
  const mode = callModeFromParams(search, voiceOnly);
  const isVideo = mode === 'video';
  const peer = useMatchStore((s) => s.peer);
  const me = useAuthStore((s) => s.user);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const reduceMotion = useReducedMotion();

  const isVoiceOnlyCaller = voiceOnly && !!me && !!peer && me.id < peer.userId;
  const isVoiceOnlyCallee = voiceOnly && !!me && !!peer && me.id >= peer.userId;
  const isIncoming = ringerIncoming || isVoiceOnlyCallee;

  const {
    callState,
    localStream,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    muted,
    cameraOn,
    toggleCamera,
    speakerOn,
    toggleSpeaker,
    error,
  } = useWebRTC({ conversationId, mode, isIncoming });

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (voiceOnly && !isVoiceOnlyCaller) return;
    if (isVideo) return;
    if (callState === 'IDLE' && !isIncoming) {
      autoStartedRef.current = true;
      void startCall();
    }
  }, [callState, isIncoming, startCall, voiceOnly, isVoiceOnlyCaller, isVideo]);

  const autoAcceptedRef = useRef(false);
  useEffect(() => {
    if (autoAcceptedRef.current) return;
    if (!isVoiceOnlyCallee) return;
    if (callState !== 'RINGING') return;
    autoAcceptedRef.current = true;
    void acceptCall();
  }, [isVoiceOnlyCallee, callState, acceptCall]);

  useRingtone(callState === 'DIALING', 'outgoing');
  useRingtone(callState === 'RINGING', 'incoming');

  useEffect(() => {
    if (isVideo) return;
    if (audioRef.current) {
      audioRef.current.srcObject = remoteStream;
      audioRef.current.muted = !speakerOn;
      if (remoteStream) void audioRef.current.play().catch(() => undefined);
    }
  }, [remoteStream, speakerOn, isVideo]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.muted = !speakerOn;
      if (remoteStream) void remoteVideoRef.current.play().catch(() => undefined);
    }
  }, [remoteStream, speakerOn]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      if (localStream) void localVideoRef.current.play().catch(() => undefined);
    }
  }, [localStream]);

  useEffect(() => {
    if (callState !== 'CONNECTED') return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [callState]);

  const visualizerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (isVideo || callState !== 'CONNECTED' || !remoteStream || !visualizerCanvasRef.current) {
      return;
    }

    const canvas = visualizerCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 240;
    canvas.height = 240;

    let audioCtx: AudioContext | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined;
    let animationId: number | undefined;

    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      audioCtx = new AudioContextCtor();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;

      source = audioCtx.createMediaStreamSource(remoteStream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);

        let total = 0;
        for (let i = 0; i < bufferLength; i++) total += dataArray[i] ?? 0;
        const volumeFactor = total / bufferLength / 255;

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let r = 1; r <= 3; r++) {
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
  }, [callState, remoteStream, isVideo]);

  useEffect(() => {
    if (callState !== 'ENDED') return;
    const dest = voiceOnly ? '/mood' : `/chat/${conversationId}`;
    const t = setTimeout(() => router.replace(dest), 1000);
    return () => clearTimeout(t);
  }, [callState, router, conversationId, voiceOnly]);

  const statusLabel =
    callState === 'IDLE'
      ? isVideo
        ? 'Ready for video call'
        : 'Preparing...'
      : callState === 'DIALING'
        ? 'Ringing...'
        : callState === 'RINGING'
          ? isVideo
            ? 'Incoming video call'
            : 'Incoming call'
          : callState === 'CONNECTING'
            ? 'Connecting...'
            : callState === 'CONNECTED'
              ? formatDuration(elapsed)
              : 'Call ended';

  const peerInitial = peer?.nickname[0]?.toUpperCase() ?? '?';
  const returnToPreviousScreen = () => {
    router.replace(voiceOnly ? '/mood' : `/chat/${conversationId}`);
  };
  const isPermissionError =
    !!error && /blocked|permission|allow camera|allow microphone/i.test(error);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b141a] text-white">
      <div className="absolute inset-0">
        {isVideo ? (
          <>
            <video
              ref={remoteVideoRef}
              data-testid="remote-video"
              autoPlay
              playsInline
              className={`h-full w-full bg-black object-cover transition-opacity ${
                remoteStream ? 'opacity-100' : 'opacity-0'
              }`}
            />
            {!remoteStream && (
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#111b21] via-[#0b141a] to-[#111827]">
                <div className="flex flex-col items-center gap-4">
                  <div className="grid h-36 w-36 place-items-center rounded-full bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 text-5xl font-semibold shadow-2xl">
                    {peerInitial}
                  </div>
                  <p className="text-sm text-white/55">Waiting for video...</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#111b21] via-[#0b141a] to-[#101827]">
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
                  className="absolute inset-[-40px] z-0 h-[240px] w-[240px] rounded-full pointer-events-none"
                />
              ) : (
                <motion.div
                  animate={
                    reduceMotion ? undefined : { scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }
                  }
                  transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity }}
                  className="absolute inset-0 rounded-full bg-primary/40"
                />
              )}
              <div className="relative z-10 grid h-40 w-40 place-items-center rounded-full bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 text-5xl font-semibold shadow-2xl">
                {peerInitial}
              </div>
            </motion.div>
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/70 via-black/35 to-transparent px-4 pb-8 pt-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-sm font-semibold">
            {peerInitial}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <h1 className="truncate text-lg font-semibold leading-tight">
              {peer?.nickname ?? 'Stranger'}
            </h1>
            <p className="mt-0.5 text-sm text-white/70" aria-live="assertive">
              {statusLabel}
            </p>
          </div>
          {voiceOnly && (
            <div className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/75 backdrop-blur md:flex">
              <AudioLines className="h-4 w-4 text-sky-300" />
              Voice-only match
            </div>
          )}
        </div>
      </div>

      {isVideo && (
        <div
          data-testid="local-video-preview"
          className="absolute right-4 top-28 z-20 overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl md:right-6 md:top-24"
        >
          {localStream && cameraOn ? (
            <video
              ref={localVideoRef}
              data-testid="local-video"
              autoPlay
              muted
              playsInline
              className="h-40 w-28 object-cover md:h-48 md:w-36"
            />
          ) : (
            <div className="grid h-40 w-28 place-items-center bg-[#111b21] text-white/60 md:h-48 md:w-36">
              <CameraOff className="h-7 w-7" />
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          aria-live="assertive"
          className="absolute inset-x-4 bottom-36 z-30 mx-auto max-w-md rounded-2xl border border-destructive/40 bg-destructive/15 px-4 py-3 text-center text-sm text-red-100 backdrop-blur"
        >
          <p>{error}</p>
          {isPermissionError && (
            <p className="mt-1 text-xs text-red-100/75">
              If no browser popup appears, open site settings and allow camera/microphone.
            </p>
          )}
        </div>
      )}

      {!isVideo && <audio ref={audioRef} autoPlay playsInline />}

      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-4 pb-6 pt-10">
        {callState === 'RINGING' ? (
          <IncomingCallSlider isVideo={isVideo} onAccept={acceptCall} onReject={rejectCall} />
        ) : (
          <div className="mx-auto flex max-w-md items-center justify-center gap-4 rounded-full border border-white/10 bg-[#111b21]/85 px-4 py-3 shadow-2xl backdrop-blur-xl">
            {callState === 'IDLE' ? (
              <>
                <button
                  type="button"
                  onClick={returnToPreviousScreen}
                  aria-label="Leave call"
                  className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
                >
                  <PhoneOff className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void startCall()}
                  aria-label={isVideo ? 'Start video call' : 'Start voice call'}
                  className="flex h-14 items-center gap-2 rounded-full bg-emerald-500 px-5 font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
                >
                  {isVideo ? <Camera className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                  <span>{isVideo ? 'Start video' : 'Start call'}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
                >
                  {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                {isVideo && (
                  <button
                    type="button"
                    onClick={toggleCamera}
                    aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
                    className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
                  >
                    {cameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={hangup}
                  aria-label="Hang up"
                  className="grid h-14 w-14 place-items-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/30"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={toggleSpeaker}
                  aria-label={speakerOn ? 'Speaker off' : 'Speaker on'}
                  className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
                >
                  {speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
