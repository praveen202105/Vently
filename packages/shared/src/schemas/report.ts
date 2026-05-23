import { z } from 'zod';

export const reportReasonSchema = z.enum([
  'HARASSMENT',
  'INAPPROPRIATE_CONTENT',
  'SPAM',
  'IMPERSONATION',
  'UNDERAGE',
  'OTHER',
]);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const createReportSchema = z.object({
  reportedId: z.string().cuid(),
  conversationId: z.string().cuid().optional(),
  reason: reportReasonSchema,
  details: z.string().max(2000).optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;
