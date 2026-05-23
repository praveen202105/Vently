'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Sparkles, User } from 'lucide-react';
import { Button, GlassCard } from '@vently/ui';
import { onboardingSchema, type OnboardingInput } from '@vently/shared';
import { useAuthStore } from '@/stores/auth-store';
import { upsertProfile } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

export function OnboardingForm() {
  const router = useRouter();
  const setProfile = useAuthStore((s) => s.setProfile);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { ageConfirmed: undefined as unknown as true },
  });

  const gender = watch('gender');
  const ageConfirmed = watch('ageConfirmed');

  const onSubmit = async (data: OnboardingInput) => {
    setSubmitting(true);
    try {
      const profile = await upsertProfile(data);
      setProfile(profile);
      router.replace('/mood');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not save profile';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassCard className="w-full max-w-md p-8">
      <h1 className="text-3xl mb-2 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
        Pick your name
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">
        This is the only thing other users will see. You can change it later.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label htmlFor="nickname" className="block text-sm mb-1">
            Nickname
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="nickname"
              autoComplete="off"
              maxLength={20}
              {...register('nickname')}
              className="w-full bg-input rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-primary/60 border border-glass-border"
            />
          </div>
          {errors.nickname && (
            <p className="text-destructive text-xs mt-1">{errors.nickname.message}</p>
          )}
        </div>

        <div>
          <span className="block text-sm mb-2">Gender</span>
          <div className="grid grid-cols-2 gap-3">
            {(['MALE', 'FEMALE'] as const).map((g) => (
              <motion.button
                key={g}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setValue('gender', g, { shouldValidate: true })}
                className={`rounded-xl border px-4 py-3 text-sm transition-all ${
                  gender === g
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-glass-border bg-input text-muted-foreground hover:border-primary/40'
                }`}
              >
                {g === 'MALE' ? 'Male' : 'Female'}
              </motion.button>
            ))}
          </div>
          {errors.gender && (
            <p className="text-destructive text-xs mt-1">{errors.gender.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="bio" className="block text-sm mb-1">
            Bio <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="bio"
            rows={2}
            maxLength={280}
            {...register('bio')}
            className="w-full bg-input rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/60 border border-glass-border resize-none"
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={ageConfirmed === true}
            onChange={(e) =>
              setValue('ageConfirmed', e.target.checked === true ? true : (false as unknown as true), {
                shouldValidate: true,
              })
            }
            className="mt-1"
          />
          <span className="text-sm text-muted-foreground">
            I confirm I am 18 or older and understand Vently may include flirty or
            late-night conversations.
          </span>
        </label>
        {errors.ageConfirmed && (
          <p className="text-destructive text-xs">{errors.ageConfirmed.message}</p>
        )}

        <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={submitting}>
          <Sparkles className="w-5 h-5" />
          {submitting ? 'Setting up…' : 'Continue'}
        </Button>
      </form>
    </GlassCard>
  );
}
