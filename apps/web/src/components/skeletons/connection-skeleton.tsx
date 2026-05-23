'use client';

import { GlassCard, Skeleton } from '@vently/ui';

export function ConnectionSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-label="Loading connections" role="status">
      {Array.from({ length: count }).map((_, i) => (
        <GlassCard key={i} className="p-3 flex items-center gap-3">
          <Skeleton shape="circle" className="w-10 h-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton shape="line" className="w-1/3" />
            <Skeleton shape="line" className="w-1/2 opacity-60" />
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
