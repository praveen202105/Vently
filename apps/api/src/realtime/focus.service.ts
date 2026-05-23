import { Injectable } from '@nestjs/common';

/**
 * Tracks which conversation each user is currently focused on, so that
 * PushService can skip notifications for messages they're already reading.
 *
 * In-memory single-process state — fine for the current single-instance
 * Railway api. Horizontal scale would move this to Redis (SET focus:<userId>
 * <conversationId> EX 60). The client refreshes its focus on every chat
 * mount/unmount, so a process restart just means push isn't suppressed
 * until users re-mount — acceptable.
 *
 * "Focused" here is a per-USER concept, not per-socket. If a user has two
 * tabs open with different chats, the most recent focus wins — that's the
 * one the next push would target anyway.
 */
@Injectable()
export class FocusService {
  private readonly focus = new Map<string, string>();

  setFocus(userId: string, conversationId: string | null): void {
    if (conversationId) {
      this.focus.set(userId, conversationId);
    } else {
      this.focus.delete(userId);
    }
  }

  isFocusedOn(userId: string, conversationId: string): boolean {
    return this.focus.get(userId) === conversationId;
  }

  clearAllForUser(userId: string): void {
    this.focus.delete(userId);
  }
}
