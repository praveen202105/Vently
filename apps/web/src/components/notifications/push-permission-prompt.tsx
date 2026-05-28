'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, GlassCard } from '@vently/ui';
import { useAuthStore } from '@/stores/auth-store';
import { usePush } from '@/lib/push/use-push';

const DISMISS_KEY = 'vently.push.dismissed';

/**
 * Soft prompt shown ONCE to authenticated users with push support, before
 * we burn the browser's native permission prompt. The browser permanently
 * disables future requests if the user clicks "Block" on the native dialog,
 * so we earn the right to ask first by showing this card. Tracked via
 * localStorage so we don't pester someone who picked "Not now".
 *
 * Triggers on:
 *  - User signed in (accessToken set)
 *  - Push supported on this browser/OS
 *  - Notification.permission === 'default' (never asked OR previously reset)
 *  - localStorage flag not set
 *
 * Reappears if the user clears site data or the permission goes back to
 * 'default' (e.g. browser settings reset). Doesn't reappear after "Block".
 */
export function PushPermissionPrompt() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { permission, supported, enable, working } = usePush();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  const open = !!accessToken && supported && permission === 'default' && !dismissed;

  const handleEnable = async () => {
    const ok = await enable();
    if (ok) toast.success("You'll get pinged when something happens");
  };

  const handleDismiss = () => {
    if (typeof window !== 'undefined') window.localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:w-96 z-40"
          role="dialog"
          aria-labelledby="push-prompt-title"
        >
          <GlassCard className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p id="push-prompt-title" className="text-sm font-medium">
                  Get pinged when someone messages you
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  We'll only notify you about chats, friend requests, and matches.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button variant="primary" size="sm" onClick={handleEnable} disabled={working}>
                    {working ? '…' : 'Enable'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDismiss}>
                    Not now
                  </Button>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss"
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </GlassCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
