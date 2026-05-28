'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal, Play, Cpu, Cloud, Globe, 
  RefreshCw, CheckCircle, XCircle, AlertCircle 
} from 'lucide-react';
import { AnimatedBackground, Button, GlassCard } from '@vently/ui';
import { useSocket } from '@/lib/socket/use-socket';

export function DevDashboardScreen() {
  const socket = useSocket();
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [exitCode, setExitCode] = useState<number | null>(null);
  
  const consoleEndRef = useRef<HTMLDivElement | null>(null);

  // Check the NestJS backend API health on mount
  const checkApiHealth = async () => {
    setApiStatus('checking');
    try {
      const res = await fetch('http://localhost:4000/health', { method: 'GET' });
      if (res.ok) setApiStatus('online');
      else setApiStatus('offline');
    } catch {
      setApiStatus('offline');
    }
  };

  useEffect(() => {
    void checkApiHealth();
  }, []);

  // Auto-scroll the terminal console logs to the bottom
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Stream E2E pipeline logs in real time from Next.js server route
  const startVerification = async () => {
    if (running) return;
    setRunning(true);
    setExitCode(null);
    setLogs(['[Starting Local E2E Verification Loop...]\n']);

    try {
      const response = await fetch('/api/dev-trigger', {
        method: 'POST',
      });

      if (!response.body) {
        setLogs((prev) => [...prev, '❌ Response body streaming not supported.']);
        setRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        setLogs((prev) => [...prev, chunk]);

        // Parse exit code from standard output completion log
        const match = chunk.match(/\[Process completed with exit code (\d+)\]/);
        if (match && match[1]) {
          setExitCode(parseInt(match[1], 10));
        }
      }
    } catch (err: any) {
      setLogs((prev) => [...prev, `\n❌ Pipeline crashed: ${err.message}`]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <AnimatedBackground variant="mood" mood="FRIENDSHIP" />
      
      {/* Sleek dev header */}
      <header className="relative z-10 flex items-center justify-between p-5 border-b border-glass-border bg-glass-bg backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              Vently Dev Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">Local Developer Suite</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void checkApiHealth()} className="p-2.5">
            <RefreshCw className={`w-4 h-4 ${apiStatus === 'checking' ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      {/* Control panel & status metrics */}
      <div className="relative z-10 flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* NestJS Backend status card */}
          <GlassCard className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cloud className="w-5 h-5 text-sky-400" />
              <div>
                <p className="text-sm font-semibold">NestJS API</p>
                <p className="text-[10px] text-muted-foreground">localhost:4000</p>
              </div>
            </div>
            {apiStatus === 'online' ? (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Online
              </span>
            ) : apiStatus === 'offline' ? (
              <span className="text-xs text-destructive flex items-center gap-1">
                <XCircle className="w-4 h-4" /> Offline
              </span>
            ) : (
              <span className="text-xs text-yellow-400 flex items-center gap-1 animate-pulse">
                Checking...
              </span>
            )}
          </GlassCard>

          {/* Web Socket.io status card */}
          <GlassCard className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-purple-400" />
              <div>
                <p className="text-sm font-semibold">Web Socket.io</p>
                <p className="text-[10px] text-muted-foreground">Real-time gateway</p>
              </div>
            </div>
            {socket && socket.connected ? (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Connected
              </span>
            ) : (
              <span className="text-xs text-yellow-400 flex items-center gap-1 animate-pulse">
                Disconnected
              </span>
            )}
          </GlassCard>

          {/* Production URL smoke test destination */}
          <GlassCard className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-pink-400" />
              <div>
                <p className="text-sm font-semibold">Prod Target</p>
                <p className="text-[10px] text-muted-foreground">E2E smoke tests</p>
              </div>
            </div>
            <a 
              href="https://vently-web-gamma.vercel.app" 
              target="_blank" 
              rel="noreferrer"
              className="text-xs text-sky-400 underline hover:text-sky-300"
            >
              vercel.app
            </a>
          </GlassCard>
        </div>

        {/* Trigger Button panel */}
        <div className="flex flex-col items-center gap-4 py-4">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full max-w-sm"
          >
            <Button
              variant="gradient"
              size="lg"
              disabled={running}
              onClick={startVerification}
              className="w-full flex items-center justify-center gap-2 py-4 text-base font-bold shadow-2xl relative overflow-hidden"
            >
              {running ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" /> Running E2E Verification Loop...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" /> Run Local E2E Pipeline
                </>
              )}
            </Button>
          </motion.div>
          <p className="text-xs text-muted-foreground text-center">
            Runs local Playwright tests and generates/updates <code className="bg-muted px-1.5 py-0.5 rounded text-white">bugs.md</code> on failures.
          </p>
        </div>

        {/* Live Terminal Console Visualizer */}
        <GlassCard className="flex-1 flex flex-col rounded-2xl overflow-hidden border border-glass-border shadow-2xl bg-black/80">
          <div className="flex items-center justify-between px-4 py-2 border-b border-glass-border bg-glass-bg">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-mono font-bold text-muted-foreground">Interactive Console Logs</span>
            </div>
            
            <AnimatePresence>
              {exitCode !== null && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-1.5"
                >
                  {exitCode === 0 ? (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1 font-bold font-mono">
                      <CheckCircle className="w-3 h-3" /> PIPELINE PASSED
                    </span>
                  ) : (
                    <span className="text-[10px] bg-destructive/20 text-destructive px-2.5 py-0.5 rounded-full border border-destructive/30 flex items-center gap-1 font-bold font-mono">
                      <AlertCircle className="w-3 h-3" /> PIPELINE FAILED (BUGS WRITTEN)
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="p-4 h-80 overflow-y-auto font-mono text-xs text-emerald-400 space-y-1.5 scrollbar-thin select-text">
            {logs.length === 0 ? (
              <p className="text-muted-foreground italic">Console idle. Tap the Run button to start.</p>
            ) : (
              logs.map((log, idx) => (
                <pre key={idx} className="whitespace-pre-wrap leading-relaxed select-text font-mono">
                  {log}
                </pre>
              ))
            )}
            <div ref={consoleEndRef} />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
