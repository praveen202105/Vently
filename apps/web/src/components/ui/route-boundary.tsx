'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button, GlassCard } from '@vently/ui';

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Optional contextual label (e.g. "loading this chat", "your connections"). */
  context?: string;
  /** Where the "Go home" button should send the user. Defaults to /home. */
  homeHref?: string;
}

/**
 * Per-segment fallback. Replaces a blank screen when a route throws so users
 * get an explicit "Try again" + "Go home" instead of staring at nothing.
 * Next.js wires this through file-system convention (error.tsx) — each
 * segment exports a tiny default that renders this with its own copy.
 */
export function RouteError({ error, reset, context, homeHref = '/home' }: RouteErrorProps) {
  const router = useRouter();

  useEffect(() => {
    // V1: forward to Sentry.
    // eslint-disable-next-line no-console
    console.error('[route-error]', context ?? 'unknown', error);
  }, [context, error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <GlassCard className="p-8 max-w-md text-center">
        <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-3" />
        <h1 className="text-2xl mb-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {context
            ? `We hit a snag ${context}. Try again, or head home and start over.`
            : 'We hit a snag loading this page. Try again, or head home and start over.'}
          {error.digest && (
            <span className="block mt-2 text-xs opacity-70">Reference: {error.digest}</span>
          )}
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="ghost" size="md" onClick={() => router.push(homeHref)}>
            Go home
          </Button>
          <Button variant="primary" size="md" onClick={reset}>
            Try again
          </Button>
        </div>
      </GlassCard>
    </main>
  );
}

interface RouteLoadingProps {
  /** Optional one-line label shown under the spinner. */
  label?: string;
}

export function RouteLoading({ label }: RouteLoadingProps) {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-6 gap-3"
      aria-busy="true"
      aria-label={label ?? 'Loading'}
    >
      <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </main>
  );
}
