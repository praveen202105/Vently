import { z } from 'zod';

export const updateAiMemorySchema = z.object({
  enabled: z.boolean(),
});
export type UpdateAiMemoryInput = z.infer<typeof updateAiMemorySchema>;
