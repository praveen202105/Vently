'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import {
  Edit2,
  Check,
  X,
  LogOut,
  Heart,
  MessageCircle,
  Sparkles,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { Button, GlassCard } from '@vently/ui';
import type { AiMemoryStatus } from '@vently/shared';
import { useAuthStore } from '@/stores/auth-store';
import {
  clearAiMemory,
  getAiMemoryStatus,
  logout,
  updateAiMemory,
  updateProfile,
} from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { ProfileSkeleton } from '@/components/skeletons/profile-skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function ProfileScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const clear = useAuthStore((s) => s.clear);

  const [editing, setEditing] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState(profile?.nickname ?? '');
  const [saving, setSaving] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState<AiMemoryStatus | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [clearMemoryOpen, setClearMemoryOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    void getAiMemoryStatus()
      .then((status) => {
        if (!cancelled) setMemoryStatus(status);
      })
      .catch(() => {
        if (!cancelled) setMemoryStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (!profile) {
    return <ProfileSkeleton />;
  }

  const saveNickname = async () => {
    const trimmed = nicknameDraft.trim();
    if (trimmed.length < 3 || trimmed === profile.nickname) {
      setEditing(false);
      setNicknameDraft(profile.nickname);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProfile({ nickname: trimmed });
      setProfile(updated);
      setEditing(false);
      toast.success('Nickname updated');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not update nickname';
      toast.error(msg);
      setNicknameDraft(profile.nickname);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // even if API call fails, clear local state
    }
    clear();
    router.replace('/welcome');
  };

  const toggleMemory = async () => {
    if (!memoryStatus || memoryBusy) return;
    const nextEnabled = !memoryStatus.enabled;
    setMemoryBusy(true);
    try {
      const next = await updateAiMemory({ enabled: nextEnabled });
      setMemoryStatus(next);
      toast.success(nextEnabled ? 'Chat personalization enabled' : 'Chat personalization paused');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not update personalization';
      toast.error(msg);
    } finally {
      setMemoryBusy(false);
    }
  };

  const handleClearMemory = async () => {
    setMemoryBusy(true);
    try {
      await clearAiMemory();
      setMemoryStatus({
        enabled: false,
        chunkCount: 0,
        lastUpdatedAt: null,
        retentionDays: memoryStatus?.retentionDays ?? 90,
      });
      setClearMemoryOpen(false);
      toast.success('Chat personalization cleared');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not clear personalization';
      toast.error(msg);
    } finally {
      setMemoryBusy(false);
    }
  };

  return (
    <div className="min-h-screen max-w-2xl mx-auto p-6 space-y-6">
      <header className="text-center">
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring' }}
          className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 text-white text-4xl mb-4"
        >
          {profile.nickname[0]?.toUpperCase() ?? '?'}
        </motion.div>

        {editing ? (
          <div className="flex items-center justify-center gap-2">
            <input
              value={nicknameDraft}
              onChange={(e) => setNicknameDraft(e.target.value)}
              autoFocus
              maxLength={20}
              className="bg-input rounded-lg px-3 py-2 outline-none border border-glass-border text-center"
            />
            <button
              type="button"
              onClick={saveNickname}
              disabled={saving}
              className="p-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition"
              aria-label="Save nickname"
            >
              <Check className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setNicknameDraft(profile.nickname);
              }}
              className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition"
              aria-label="Cancel edit"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl">{profile.nickname}</h1>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground"
              aria-label="Edit nickname"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
        )}

        <p className="text-muted-foreground text-sm mt-1">
          {profile.gender === 'MALE' ? 'Male' : 'Female'} ·{' '}
          {profile.mood ? profile.mood.replace('_', ' ').toLowerCase() : 'no mood set'}
        </p>
      </header>

      <GlassCard className="p-6">
        <h2 className="text-lg mb-4">Your stats</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <MessageCircle className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl">—</p>
            <p className="text-xs text-muted-foreground">Conversations</p>
          </div>
          <div>
            <Heart className="w-5 h-5 mx-auto mb-1 text-secondary" />
            <p className="text-2xl">—</p>
            <p className="text-xs text-muted-foreground">Friends</p>
          </div>
          <div>
            <Sparkles className="w-5 h-5 mx-auto mb-1 text-accent" />
            <p className="text-2xl">—</p>
            <p className="text-xs text-muted-foreground">Calls</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-4">Stats arrive in Phase 5.</p>
      </GlassCard>

      <GlassCard className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-primary shrink-0" />
              <h2 className="text-lg">Chat personalization</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {memoryStatus?.enabled ? `On · ${memoryStatus.retentionDays}-day retention` : 'Off'}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={memoryStatus?.enabled ?? false}
            aria-label="Toggle chat personalization"
            disabled={!memoryStatus || memoryBusy}
            onClick={toggleMemory}
            className={`relative h-8 w-14 shrink-0 rounded-full border transition disabled:opacity-50 ${
              memoryStatus?.enabled ? 'bg-primary border-primary' : 'bg-muted border-glass-border'
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
                memoryStatus?.enabled ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-4 text-destructive hover:bg-destructive/10"
          disabled={!memoryStatus || memoryStatus.chunkCount === 0 || memoryBusy}
          onClick={() => setClearMemoryOpen(true)}
        >
          <Trash2 className="w-4 h-4" />
          Clear personalization
        </Button>
      </GlassCard>

      <div className="space-y-3">
        <Button variant="outline" size="md" className="w-full" onClick={() => router.push('/mood')}>
          Change mood
        </Button>

        <Button
          variant="ghost"
          size="md"
          className="w-full text-destructive hover:bg-destructive/10"
          onClick={() => setLogoutOpen(true)}
        >
          <LogOut className="w-4 h-4" />
          Log out
        </Button>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title="Log out of Vently?"
        description="You'll need to sign in again to chat or take a call."
        confirmLabel="Log out"
        busy={loggingOut}
        onConfirm={handleLogout}
        onCancel={() => setLogoutOpen(false)}
      />

      <ConfirmDialog
        open={clearMemoryOpen}
        title="Clear personalization?"
        description="This deletes saved chat personalization and turns personalization off."
        confirmLabel="Clear"
        busy={memoryBusy}
        onConfirm={handleClearMemory}
        onCancel={() => setClearMemoryOpen(false)}
      />
    </div>
  );
}
