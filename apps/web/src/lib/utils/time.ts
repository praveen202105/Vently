// Shared time formatters used by the connections tile (relative) and the
// chat message timestamps (absolute). Avoids pulling in date-fns just for
// two display formats.

/**
 * Compact relative time used for friend-tile previews.
 *
 *   now / 2m / 3h / yesterday / 4d / Mar 5
 */
export function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Absolute clock time used between chat-message clusters.
 *
 *   14:32                 (today)
 *   Yesterday 14:32       (yesterday)
 *   Mon 14:32             (this week)
 *   Mar 5 14:32           (older)
 */
export function formatChatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  const hhmm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  if (sameDay) return hhmm;
  if (isYesterday) return `Yesterday ${hhmm}`;

  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 7) {
    const weekday = d.toLocaleDateString([], { weekday: 'short' });
    return `${weekday} ${hhmm}`;
  }
  const mmm = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${mmm} ${hhmm}`;
}

// Whether two consecutive messages from the SAME sender should share a
// cluster (i.e. only the first shows a timestamp). Five minutes is the
// common-sense threshold most chat apps use.
const CLUSTER_GAP_MS = 5 * 60 * 1000;

export function shouldShowTimestamp(
  prevIso: string | null,
  currIso: string,
  prevSenderId: string | null,
  currSenderId: string,
): boolean {
  if (!prevIso || prevSenderId !== currSenderId) return true;
  const diff = new Date(currIso).getTime() - new Date(prevIso).getTime();
  return diff > CLUSTER_GAP_MS;
}

/**
 * Custom long relative time for reunion banner (e.g. "3 days ago", "yesterday", "2 hours ago")
 */
export function formatReunionRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return mins === 1 ? '1 minute ago' : `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

/**
 * Standard date-time formatter (e.g. "May 23, 11:43 PM")
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
