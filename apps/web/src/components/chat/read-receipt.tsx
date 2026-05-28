'use client';

import { Check, CheckCheck } from 'lucide-react';

export type ReadReceiptStatus = 'pending' | 'sent' | 'delivered' | 'read';

interface Props {
  status: ReadReceiptStatus;
  className?: string;
}

/**
 * WhatsApp-style read receipt ticks rendered beneath a sent message bubble.
 * - pending  → grey single tick (not yet ack'd by server)
 * - sent     → grey single tick (server confirmed storage)
 * - delivered→ grey double tick (peer's client received it)
 * - read     → blue/violet double tick (peer has seen it)
 */
export function ReadReceipt({ status, className = '' }: Props) {
  if (status === 'pending') {
    return (
      <Check
        className={`w-3 h-3 text-muted-foreground/50 ${className}`}
        aria-label="Sending…"
        data-testid="receipt-pending"
      />
    );
  }

  if (status === 'sent') {
    return (
      <Check
        className={`w-3 h-3 text-muted-foreground/60 ${className}`}
        aria-label="Sent"
        data-testid="receipt-sent"
      />
    );
  }

  if (status === 'delivered') {
    return (
      <CheckCheck
        className={`w-3.5 h-3.5 text-muted-foreground/60 ${className}`}
        aria-label="Delivered"
        data-testid="receipt-delivered"
      />
    );
  }

  // read
  return (
    <CheckCheck
      className={`w-3.5 h-3.5 text-violet-400 ${className}`}
      aria-label="Read"
      data-testid="receipt-read"
    />
  );
}
