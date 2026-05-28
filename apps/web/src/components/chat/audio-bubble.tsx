'use client';

import { Play, Pause, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface AudioBubbleProps {
  src: string;
  mine: boolean;
}

export function AudioBubble({ src, mine }: AudioBubbleProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Convert base64 voice notes back to playable local Blob URLs
  useEffect(() => {
    if (!src || !src.startsWith('audio:')) return;
    try {
      const base64Content = src.split(',')[1];
      if (!base64Content) return;

      const binary = atob(base64Content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      return () => URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to decode voice note base64:', e);
    }
  }, [src]);

  // Audio event bindings
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  // Canvas waveform rendering
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dimensions
    canvas.width = 180;
    canvas.height = 40;

    const barCount = 30;
    const spacing = 2;
    const barWidth = (canvas.width - spacing * barCount) / barCount;

    // Use deterministic, dynamic amplitudes based on a hash of source string
    // to give each audio bubble its own unique and stable waveform signature.
    const amplitudes: number[] = [];
    let hash = 0;
    for (let i = 0; i < src.length; i++) {
      hash = src.charCodeAt(i) + ((hash << 5) - hash);
    }
    for (let i = 0; i < barCount; i++) {
      const val = Math.abs(Math.sin(hash + i * 1.618));
      amplitudes.push(0.15 + val * 0.85); // between 15% and 100% height
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const progress = duration > 0 ? currentTime / duration : 0;
      const progressIndex = Math.floor(progress * barCount);

      for (let i = 0; i < barCount; i++) {
        const h = (amplitudes[i] ?? 0.5) * canvas.height * 0.8;
        const x = i * (barWidth + spacing);
        const y = (canvas.height - h) / 2;

        ctx.fillStyle =
          i <= progressIndex
            ? mine
              ? '#ffffff'
              : '#8b5cf6' // Active colors (white for me, purple for peer)
            : mine
              ? 'rgba(255,255,255,0.3)'
              : 'rgba(139,92,246,0.2)'; // Inactive colors

        ctx.fillRect(x, y, barWidth, h);
      }
    };

    draw();
  }, [src, currentTime, duration, mine]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void audio.play().catch(() => undefined);
      setIsPlaying(true);
    }
  };

  const handleScrub = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || duration === 0) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (time: number) => {
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 py-1">
      {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" />}

      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
          mine
            ? 'bg-white text-purple-600 hover:scale-105 active:scale-95'
            : 'bg-primary/20 text-primary hover:bg-primary/30'
        }`}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex flex-col gap-1">
        <canvas
          ref={canvasRef}
          onClick={handleScrub}
          className="cursor-pointer select-none rounded-lg"
          title="Click to scrub audio"
        />
        <div className="flex items-center justify-between text-[10px] opacity-75">
          <span className="font-mono">{formatTime(currentTime)}</span>
          <div className="flex items-center gap-0.5">
            <Volume2 className="w-2.5 h-2.5" />
            <span>Voice Note</span>
          </div>
          <span className="font-mono">{duration ? formatTime(duration) : '0:00'}</span>
        </div>
      </div>
    </div>
  );
}
