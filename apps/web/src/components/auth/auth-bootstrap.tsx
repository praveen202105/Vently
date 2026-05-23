'use client';

import { useAuthBootstrap } from '@/lib/auth/refresh';

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  useAuthBootstrap();
  return <>{children}</>;
}
