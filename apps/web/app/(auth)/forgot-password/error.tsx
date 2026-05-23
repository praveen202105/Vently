'use client';

import { RouteError } from '@/components/ui/route-boundary';

export default function ForgotPasswordError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} context="loading password recovery" homeHref="/login" />;
}
