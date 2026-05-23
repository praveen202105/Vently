import { z } from 'zod';

export const nicknameSchema = z
  .string()
  .min(3, 'Nickname must be at least 3 characters')
  .max(20, 'Nickname must be at most 20 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only');

export const genderSchema = z.enum(['MALE', 'FEMALE']);

export const moodSchema = z.enum([
  'LONELY',
  'NEED_TO_TALK',
  'FRIENDSHIP',
  'LATE_NIGHT',
  'ADVICE',
  'FLIRTY',
  'VOICE_ONLY',
]);

export const onboardingSchema = z.object({
  nickname: nicknameSchema,
  gender: genderSchema,
  bio: z.string().max(280).optional(),
  ageConfirmed: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm you are 18+' }),
  }),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const updateProfileSchema = z.object({
  nickname: nicknameSchema.optional(),
  bio: z.string().max(280).nullable().optional(),
  mood: moodSchema.nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
