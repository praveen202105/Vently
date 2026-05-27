'use client';

import { useEffect, useRef } from 'react';

/**
 * Dynamically updates the browser tab title to show unread message count
 * when the tab is backgrounded. Resets to the original title on focus.
 *
 * @param unreadCount - Number of unread messages to display
 * @param baseTitle - The base page title (e.g. 'Vently')
 */
export function useUnreadTabBadge(unreadCount: number, baseTitle: string) {
  const originalTitleRef = useRef<string>('');

  useEffect(() => {
    // Capture the document title on first mount
    originalTitleRef.current = document.title || baseTitle;
  }, [baseTitle]);

  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }, [unreadCount, baseTitle]);

  // Reset title when component unmounts
  useEffect(() => {
    return () => {
      document.title = originalTitleRef.current || baseTitle;
    };
  }, [baseTitle]);
}
