'use client';

import { GlassCard, Skeleton } from '@vently/ui';

export function ProfileSkeleton() {
  return (
    <div
      className="min-h-screen max-w-2xl mx-auto p-6 space-y-6"
      aria-label="Loading profile"
      role="status"
    >
      <GlassCard className="p-6 flex items-center gap-4">
        <Skeleton shape="circle" className="w-16 h-16 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton shape="line" className="w-1/2 h-4" />
          <Skeleton shape="line" className="w-1/3 opacity-60" />
        </div>
      </GlassCard>
      <GlassCard className="p-6 space-y-3">
        <Skeleton shape="line" className="w-1/4 h-4" />
        <Skeleton className="w-full h-16" />
      </GlassCard>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <GlassCard key={i} className="p-4 flex flex-col items-center gap-2">
            <Skeleton shape="line" className="w-8 h-5" />
            <Skeleton shape="line" className="w-12 opacity-60" />
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
