'use client';

import type { MessageReactionPublic } from '@vently/shared';

interface ReactionPillsProps {
  reactions: MessageReactionPublic[];
  meId: string | undefined;
  onToggle: (emoji: string) => void;
  // True when this is the local user's own bubble (right-aligned), so we
  // can mirror the pill row to keep it close to the bubble's edge.
  mine: boolean;
}

/**
 * Compact pill row showing emoji + count under a chat bubble. Each pill is
 * clickable to toggle the local user's own reaction (add if absent, remove
 * if present). Pills that include the local user get a primary-tinted
 * outline so you can tell what you've already reacted with.
 */
export function ReactionPills({ reactions, meId, onToggle, mine }: ReactionPillsProps) {
  if (reactions.length === 0) return null;

  // Group reactions by emoji so we can show "❤️ 3" instead of three separate
  // hearts. Order: preserve first-appearance so the row stays stable.
  const order: string[] = [];
  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    if (!grouped.has(r.emoji)) {
      order.push(r.emoji);
      grouped.set(r.emoji, { count: 0, mine: false });
    }
    const g = grouped.get(r.emoji)!;
    g.count += 1;
    if (r.userId === meId) g.mine = true;
  }

  return (
    <div
      className={`flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}
      aria-label="Reactions"
    >
      {order.map((emoji) => {
        const { count, mine: own } = grouped.get(emoji)!;
        return (
          <button
            key={emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(emoji);
            }}
            aria-label={`${count} ${emoji} reaction${count === 1 ? '' : 's'}${own ? ' (yours)' : ''}`}
            className={`flex items-center gap-1 px-2 h-6 rounded-full text-xs transition-colors ${
              own
                ? 'bg-primary/15 ring-1 ring-primary/50 text-foreground'
                : 'bg-glass-bg border border-glass-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="text-sm leading-none">{emoji}</span>
            {count > 1 && <span className="font-medium">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
