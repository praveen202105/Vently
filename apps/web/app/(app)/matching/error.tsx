'use client';

import { RouteError } from '@/components/ui/route-boundary';

export default function MatchingError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} context="finding a match" homeHref="/mood" />;
}
