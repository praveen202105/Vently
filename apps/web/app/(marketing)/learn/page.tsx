import type { Metadata } from 'next';
import { HomeScreen } from '@/components/screens/home-screen';

export const metadata: Metadata = {
  title: 'Learn',
  description: 'Vently - Anonymous emotional chat and voice calling.',
};

export default function LearnPage() {
  return <HomeScreen />;
}
