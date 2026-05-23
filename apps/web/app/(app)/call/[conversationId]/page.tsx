// Phase 4: WebRTC voice call surface. useWebRTC hook + signaling over socket.
export default async function CallPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-2xl mb-2">Voice Call</h1>
        <p className="text-muted-foreground text-sm">
          Conversation: <code>{conversationId}</code>
        </p>
        <p className="text-muted-foreground text-sm mt-2">Phase 4 — see VENTLY_PLAN.md §6.</p>
      </div>
    </div>
  );
}
