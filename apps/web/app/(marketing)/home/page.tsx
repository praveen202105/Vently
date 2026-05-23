import type { Metadata } from 'next';
import { HomeScreen } from '@/components/screens/home-screen';

export const metadata: Metadata = {
  title: 'Home',
  description: 'Vently — Anonymous emotional chat and voice calling.',
};

export default function HomePage() {
  return <HomeScreen />;
}
