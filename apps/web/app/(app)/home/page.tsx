import type { Metadata } from 'next';
import { AppHomeScreen } from '@/components/screens/app-home-screen';

export const metadata: Metadata = {
  title: 'Home',
};

export default function HomePage() {
  return <AppHomeScreen />;
}
