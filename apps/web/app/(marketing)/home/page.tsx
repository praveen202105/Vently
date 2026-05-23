import type { Metadata } from 'next';

// Phase 0 placeholder. Port the existing HomeScreen here as a Server Component
// during Phase 0 cleanup — it's static marketing content (no client state).
export const metadata: Metadata = {
  title: 'Home',
};

export default function HomePage() {
  return (
    <section className="min-h-screen flex items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-4xl mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          HomeScreen
        </h1>
        <p className="text-muted-foreground">
          Marketing/info page. Port pending in Phase 0 finish-up.
        </p>
      </div>
    </section>
  );
}
