import { ConnectionSkeleton } from '@/components/skeletons/connection-skeleton';

export default function ConnectionsLoading() {
  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto space-y-6">
      <div className="h-8 w-1/3 rounded bg-muted/30 animate-pulse" />
      <ConnectionSkeleton />
    </main>
  );
}
