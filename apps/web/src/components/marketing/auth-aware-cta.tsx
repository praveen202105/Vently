'use client';

import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';

/**
 * CTA pair on the home page. Reads the auth store so a logged-in visitor sees
 * "Continue chatting" instead of the "Get started / Sign in" pair. Falls back
 * to the anonymous view until AuthBootstrap finishes the /me round-trip.
 */

interface Props {
  /** Use the larger hero styling when in the top section, smaller when in the bottom card. */
  variant?: 'hero' | 'card';
}

export function AuthAwareCta({ variant = 'hero' }: Props) {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const hydrated = useAuthStore((s) => s.hydrated);

  const baseGradient =
    'inline-block text-center rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white shadow-lg shadow-primary/30 hover:shadow-2xl hover:shadow-primary/50 transition';
  const baseOutline =
    'inline-block text-center rounded-2xl border-2 border-primary text-primary hover:bg-primary/10 transition';

  const heroSize = 'px-6 py-3 text-base md:text-lg w-full sm:w-auto';
  const cardSize = 'px-6 py-3 text-base';

  const size = variant === 'hero' ? heroSize : cardSize;

  // If we know the user is authenticated, show the in-app CTAs.
  if (hydrated && user) {
    const target = profile ? '/mood' : '/onboarding';
    return (
      <div
        className={variant === 'hero' ? 'flex flex-col sm:flex-row gap-3 justify-center mt-8' : ''}
      >
        <Link href={target} className={`${baseGradient} ${size}`}>
          {profile ? `Continue as ${profile.nickname}` : 'Finish setting up'}
        </Link>
        {variant === 'hero' && (
          <Link href="/connections" className={`${baseOutline} ${size}`}>
            My connections
          </Link>
        )}
      </div>
    );
  }

  // Anonymous + the initial hydration-pending render.
  return (
    <div
      className={variant === 'hero' ? 'flex flex-col sm:flex-row gap-3 justify-center mt-8' : ''}
    >
      <Link href="/register" className={`${baseGradient} ${size}`}>
        {variant === 'hero' ? 'Get started' : 'Create your account'}
      </Link>
      {variant === 'hero' && (
        <Link href="/login" className={`${baseOutline} ${size}`}>
          Sign in
        </Link>
      )}
    </div>
  );
}
