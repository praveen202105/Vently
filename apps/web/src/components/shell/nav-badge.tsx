'use client';

interface NavBadgeProps {
  /** Number to render. Counts greater than 9 collapse to "9+". 0 or undefined renders nothing. */
  count?: number;
  /** Position absolute relative to the closest positioned ancestor. */
  className?: string;
}

export function NavBadge({ count, className }: NavBadgeProps) {
  if (!count || count <= 0) return null;
  const label = count > 9 ? '9+' : String(count);
  return (
    <span
      className={
        'absolute min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-[18px] text-center font-medium ' +
        (className ?? '')
      }
      aria-label={`${count} unread`}
    >
      {label}
    </span>
  );
}
