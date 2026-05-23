'use client';

import { RouteError } from '@/components/ui/route-boundary';

export default function CallError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} context="starting this call" homeHref="/connections" />;
}
