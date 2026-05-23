'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { MessageCircle, Heart, Sparkles } from 'lucide-react';

export function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/welcome'), 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <motion.div
        animate={{
          background: [
            'radial-gradient(circle at 20% 20%, rgba(124,58,237,0.4) 0%, transparent 50%)',
            'radial-gradient(circle at 80% 80%, rgba(236,72,153,0.4) 0%, transparent 50%)',
            'radial-gradient(circle at 20% 20%, rgba(124,58,237,0.4) 0%, transparent 50%)',
          ],
        }}
        transition={{ duration: 6, repeat: Infinity }}
        className="absolute inset-0"
      />

      <motion.div
        animate={{
          background: [
            'radial-gradient(circle at 80% 20%, rgba(59,130,246,0.3) 0%, transparent 50%)',
            'radial-gradient(circle at 20% 80%, rgba(236,72,153,0.3) 0%, transparent 50%)',
            'radial-gradient(circle at 80% 20%, rgba(59,130,246,0.3) 0%, transparent 50%)',
          ],
        }}
        transition={{ duration: 8, repeat: Infinity }}
        className="absolute inset-0"
      />

      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        className="absolute w-96 h-96"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="absolute top-0 left-1/2 -translate-x-1/2"
            style={{ transform: `rotate(${i * 45}deg) translateY(-150px)` }}
          >
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
              className="w-2 h-2 bg-gradient-to-r from-primary via-secondary to-accent rounded-full shadow-lg"
            />
          </motion.div>
        ))}
      </motion.div>

      {[Heart, Sparkles, MessageCircle].map((Icon, i) => (
        <motion.div
          key={i}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.5, 0.2],
            rotate: [0, 360],
          }}
          transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
          className="absolute"
          style={{ left: `${20 + i * 30}%`, top: `${30 + i * 15}%` }}
        >
          <Icon className="w-8 h-8 text-primary/30" />
        </motion.div>
      ))}

      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: 1, ease: 'easeOut', type: 'spring' }}
        className="relative z-10 flex flex-col items-center"
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [0.8, 2, 2.5], opacity: [0.8, 0.4, 0] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
            className="absolute w-32 h-32 border-4 border-primary rounded-full"
          />
        ))}

        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="relative"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 rounded-full blur-2xl opacity-50 scale-150"
          />

          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring' }}
            className="relative bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 p-8 rounded-3xl shadow-2xl"
          >
            <MessageCircle className="w-20 h-20 text-white" />
          </motion.div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.8, type: 'spring' }}
          className="mt-12 text-7xl md:text-8xl"
        >
          <motion.span
            animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
            transition={{ duration: 5, repeat: Infinity }}
            className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent"
            style={{ backgroundSize: '200% auto' }}
          >
            Vently
          </motion.span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="mt-4 text-xl text-muted-foreground text-center"
        >
          Talk Freely. Stay Anonymous.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="flex gap-2 mt-8"
          role="status"
          aria-label="Loading"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              className="w-3 h-3 bg-gradient-to-r from-primary to-secondary rounded-full"
            />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
