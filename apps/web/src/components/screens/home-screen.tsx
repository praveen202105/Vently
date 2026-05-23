import Link from 'next/link';
import { MessageCircle, Heart, Shield, Users, Clock, Sparkles } from 'lucide-react';
import { GlassCard } from '@vently/ui';

// Marketing page — Server Component (RSC). No client-side state, fully static.
// Renders the same hero / stats / features / how-it-works grid from the
// original Figma HomeScreen.

const FEATURES = [
  {
    icon: MessageCircle,
    title: 'Anonymous chats',
    desc: 'Talk freely without revealing who you are.',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Heart,
    title: 'Emotional support',
    desc: 'Connect with someone who genuinely listens.',
    gradient: 'from-pink-500 to-rose-500',
  },
  {
    icon: Shield,
    title: 'Safe & private',
    desc: 'Report, block, end conversations whenever.',
    gradient: 'from-purple-500 to-violet-500',
  },
  {
    icon: Sparkles,
    title: 'Instant matching',
    desc: 'Picked a mood? You&apos;re seconds from a chat.',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    icon: Users,
    title: 'Build connections',
    desc: 'Save the people you click with for later.',
    gradient: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Clock,
    title: '24/7 available',
    desc: 'Late-night talks, midday vents — anytime.',
    gradient: 'from-indigo-500 to-blue-500',
  },
];

const STEPS = [
  { n: '1', title: 'Sign in', desc: 'Email + password gets you a persistent anonymous identity.' },
  { n: '2', title: 'Pick a mood', desc: 'Tell us what kind of conversation you need.' },
  { n: '3', title: 'Match & talk', desc: 'Real-time chat or voice with someone in the same vibe.' },
];

export function HomeScreen() {
  return (
    <div className="min-h-screen max-w-5xl mx-auto p-6 md:p-10 space-y-16">
      <section className="text-center pt-8">
        <h1 className="text-5xl md:text-7xl mb-6">
          <span className="block bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
            Vently
          </span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Anonymous emotional chat + voice. Find someone who understands you.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <Link
            href="/register"
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white shadow-lg shadow-primary/30 hover:shadow-2xl hover:shadow-primary/50 transition"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 rounded-2xl border-2 border-primary text-primary hover:bg-primary/10 transition"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-4 text-center">
        {[
          { n: '10K+', label: 'Active users' },
          { n: '50K+', label: 'Conversations' },
          { n: '24/7', label: 'Available' },
        ].map((s) => (
          <GlassCard key={s.label} className="p-5">
            <p className="text-2xl md:text-3xl bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              {s.n}
            </p>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">{s.label}</p>
          </GlassCard>
        ))}
      </section>

      <section>
        <h2 className="text-2xl md:text-3xl text-center mb-8">What you get</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <GlassCard key={f.title} className="p-5">
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${f.gradient} mb-3`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </GlassCard>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-2xl md:text-3xl text-center mb-8">How it works</h2>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <li key={s.n} className="">
              <GlassCard className="p-5">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 text-white flex items-center justify-center mb-3">
                  {s.n}
                </div>
                <h3 className="text-lg mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </GlassCard>
            </li>
          ))}
        </ol>
      </section>

      <section className="text-center pb-8">
        <GlassCard className="p-8 md:p-10 max-w-2xl mx-auto">
          <h2 className="text-2xl mb-2">Ready to talk?</h2>
          <p className="text-muted-foreground mb-5 text-sm">
            Takes under a minute. You can leave anytime.
          </p>
          <Link
            href="/register"
            className="inline-block px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white shadow-lg shadow-primary/30 hover:shadow-2xl hover:shadow-primary/50 transition"
          >
            Create your account
          </Link>
        </GlassCard>
      </section>
    </div>
  );
}
