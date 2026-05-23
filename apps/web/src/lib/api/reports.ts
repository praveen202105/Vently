import { api } from './client';

export type ReportReason =
  | 'HARASSMENT'
  | 'INAPPROPRIATE_CONTENT'
  | 'SPAM'
  | 'IMPERSONATION'
  | 'UNDERAGE'
  | 'OTHER';

export interface CreateReportInput {
  reportedId: string;
  conversationId?: string;
  reason: ReportReason;
  details?: string;
}

export function createReport(body: CreateReportInput) {
  return api<{ id: string }>('/reports', { method: 'POST', body });
}
