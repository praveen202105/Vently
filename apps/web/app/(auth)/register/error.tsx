'use client';

import { RouteError } from '@/components/ui/route-boundary';

export default function RegisterError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} context="loading sign-up" homeHref="/welcome" />;
}
