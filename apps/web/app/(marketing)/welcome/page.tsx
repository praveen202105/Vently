import type { Metadata } from 'next';
import { WelcomeScreen } from '@/components/screens/welcome-screen';

export const metadata: Metadata = {
  title: 'Welcome',
};

export default function WelcomePage() {
  return <WelcomeScreen />;
}
