import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/providers/query-provider';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Vently — Talk Freely. Stay Anonymous.',
    template: '%s · Vently',
  },
  description: 'Anonymous emotional chat and voice calling. Find someone who understands you.',
  applicationName: 'Vently',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body>
        <QueryProvider>{children}</QueryProvider>
        <Toaster theme="dark" position="top-center" richColors />
      </body>
    </html>
  );
}
