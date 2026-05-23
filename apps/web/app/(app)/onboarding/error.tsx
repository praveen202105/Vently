'use client';

import { RouteError } from '@/components/ui/route-boundary';

export default function OnboardingError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} context="setting up your profile" />;
}
