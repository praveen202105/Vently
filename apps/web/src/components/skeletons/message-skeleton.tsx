'use client';

import { Skeleton } from '@vently/ui';

const ROWS: Array<{ side: 'left' | 'right'; width: string }> = [
  { side: 'left', width: 'w-2/3' },
  { side: 'right', width: 'w-1/2' },
  { side: 'left', width: 'w-3/4' },
  { side: 'right', width: 'w-2/5' },
  { side: 'left', width: 'w-1/2' },
];

export function MessageSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading messages" role="status">
      {ROWS.map((row, i) => (
        <div key={i} className={`flex ${row.side === 'right' ? 'justify-end' : 'justify-start'}`}>
          <Skeleton className={`${row.width} h-10`} />
        </div>
      ))}
    </div>
  );
}
