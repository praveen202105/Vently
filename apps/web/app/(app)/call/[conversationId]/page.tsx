import { VoiceCallScreen } from '@/components/screens/voice-call-screen';

export default async function CallPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <VoiceCallScreen conversationId={conversationId} />;
}
