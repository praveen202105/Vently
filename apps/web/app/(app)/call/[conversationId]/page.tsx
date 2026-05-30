import { CallScreen } from '@/components/screens/call-screen';

export default async function CallPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <CallScreen conversationId={conversationId} />;
}
