import { ChatScreen } from '@/components/screens/chat-screen';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <ChatScreen conversationId={conversationId} />;
}
