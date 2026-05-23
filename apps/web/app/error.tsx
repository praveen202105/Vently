'use client';

import { useEffect } from 'react';
import { Button } from '@vently/ui';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // V1: forward to Sentry.
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-3xl mb-2 text-destructive">Something broke</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          {error.digest ? `Reference: ${error.digest}` : error.message}
        </p>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
