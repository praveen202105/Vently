import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-3xl mb-2 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
          Lost in the static
        </h1>
        <p className="text-muted-foreground mb-6">That page doesn&apos;t exist (or never did).</p>
        <Link
          href="/"
          className="text-primary underline-offset-4 hover:underline"
        >
          Back to Vently
        </Link>
      </div>
    </main>
  );
}
