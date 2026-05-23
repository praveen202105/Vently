'use client';

import { RouteError } from '@/components/ui/route-boundary';

export default function ChatError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} context="loading this chat" homeHref="/connections" />;
}
