'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flag, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, GlassCard } from '@vently/ui';
import { createReport, type ReportReason } from '@/lib/api/reports';
import { ApiError } from '@/lib/api/client';

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'HARASSMENT', label: 'Harassment or hate' },
  { id: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate content' },
  { id: 'SPAM', label: 'Spam' },
  { id: 'IMPERSONATION', label: 'Impersonation' },
  { id: 'UNDERAGE', label: 'Underage user' },
  { id: 'OTHER', label: 'Something else' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  reportedUserId: string;
  conversationId?: string;
}

export function ReportDialog({ open, onClose, reportedUserId, conversationId }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await createReport({
        reportedId: reportedUserId,
        conversationId,
        reason,
        details: details.trim() || undefined,
      });
      toast.success('Report submitted — thank you');
      onClose();
      setReason(null);
      setDetails('');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not submit report';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-title"
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md"
          >
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Flag className="w-5 h-5 text-destructive" />
                  <h2 id="report-title" className="text-lg">
                    Report user
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1.5 rounded-lg hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                Your report is anonymous to the other user.
              </p>

              <div className="space-y-2 mb-4">
                {REASONS.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      reason === r.id
                        ? 'border-primary bg-primary/10'
                        : 'border-glass-border bg-input hover:border-primary/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.id}
                      checked={reason === r.id}
                      onChange={() => setReason(r.id)}
                      className="accent-primary"
                    />
                    <span className="text-sm">{r.label}</span>
                  </label>
                ))}
              </div>

              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Add details (optional)"
                rows={3}
                maxLength={2000}
                className="w-full bg-input rounded-xl px-4 py-2.5 outline-none border border-glass-border focus:ring-2 focus:ring-primary/40 resize-none mb-4"
              />

              <div className="flex gap-3">
                <Button variant="ghost" size="md" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  className="flex-1"
                  onClick={submit}
                  disabled={!reason || submitting}
                >
                  {submitting ? 'Submitting…' : 'Submit'}
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
