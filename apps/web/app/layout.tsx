import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/providers/query-provider';
import { AuthBootstrap } from '@/components/auth/auth-bootstrap';
import '@/styles/globals.css';

// next/font/google was flaking the dev SSR with intermittent JSON parse
// errors when Google Fonts returned slowly. System stack works everywhere,
// matches the visual contract well enough, and can be swapped for a local
// font (next/font/local) later if needed.

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
    <html lang="en" className="dark">
      <body>
        <QueryProvider>
          {/* Hydrate the session on every route so marketing/home pages can
              show personalised CTAs and so a refresh on any page doesn't make
              the user look anonymous to themselves. */}
          <AuthBootstrap>{children}</AuthBootstrap>
        </QueryProvider>
        <Toaster theme="dark" position="top-center" richColors />
      </body>
    </html>
  );
}
