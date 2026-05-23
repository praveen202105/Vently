'use client';

import { RouteError } from '@/components/ui/route-boundary';

export default function MoodError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} context="loading the mood picker" />;
}
