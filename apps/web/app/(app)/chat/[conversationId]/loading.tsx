import { MessageSkeleton } from '@/components/skeletons/message-skeleton';

export default function ChatLoading() {
  return (
    <main className="min-h-screen flex flex-col p-4 gap-4">
      <div className="h-12 rounded-xl bg-muted/30 animate-pulse" />
      <div className="flex-1 p-4">
        <MessageSkeleton />
      </div>
    </main>
  );
}
