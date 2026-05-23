'use client';

import { RouteError } from '@/components/ui/route-boundary';

export default function ConnectionsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} context="loading your connections" />;
}
