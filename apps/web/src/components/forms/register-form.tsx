'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button, GlassCard } from '@vently/ui';
import { registerSchema, type RegisterInput } from '@vently/shared';
import { useAuthStore } from '@/stores/auth-store';
import { register as registerApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

const formSchema: z.ZodType<RegisterInput> = registerSchema;

export function RegisterForm() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(formSchema) });

  const onSubmit = async (data: RegisterInput) => {
    setSubmitting(true);
    try {
      const res = await registerApi(data);
      setAuth({ accessToken: res.accessToken, user: res.user, profile: res.profile });
      router.replace('/onboarding');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Registration failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassCard className="w-full max-w-md p-8">
      <h1 className="text-3xl mb-2 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
        Create your account
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">
        You stay anonymous to other users — we just need this to keep your friends list.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            className="w-full bg-input rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/60 border border-glass-border"
          />
          {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
            className="w-full bg-input rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/60 border border-glass-border"
          />
          {errors.password && (
            <p className="text-destructive text-xs mt-1">{errors.password.message}</p>
          )}
          <p className="text-muted-foreground text-xs mt-1">
            At least 8 characters, with letters and numbers.
          </p>
        </div>

        <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="text-muted-foreground text-sm text-center mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </GlassCard>
  );
}
