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
 *
 * Visibility is per-socket because a user can have several tabs. Calls should
 * only skip OS push if at least one connected tab is visibly active.
 */
@Injectable()
export class FocusService {
  private readonly focus = new Map<string, string>();
  private readonly visibleSocketsByUser = new Map<string, Set<string>>();
  private readonly socketOwners = new Map<string, string>();

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

  setVisibility(userId: string, socketId: string, visible: boolean): void {
    const visibleSockets = this.visibleSocketsByUser.get(userId) ?? new Set<string>();

    if (visible) {
      this.socketOwners.set(socketId, userId);
      visibleSockets.add(socketId);
      this.visibleSocketsByUser.set(userId, visibleSockets);
      return;
    }

    this.socketOwners.delete(socketId);
    visibleSockets.delete(socketId);
    if (visibleSockets.size === 0) {
      this.visibleSocketsByUser.delete(userId);
    } else {
      this.visibleSocketsByUser.set(userId, visibleSockets);
    }
  }

  isUserVisible(userId: string): boolean {
    return (this.visibleSocketsByUser.get(userId)?.size ?? 0) > 0;
  }

  clearSocket(socketId: string): void {
    const userId = this.socketOwners.get(socketId);
    if (!userId) return;
    this.socketOwners.delete(socketId);
    const visibleSockets = this.visibleSocketsByUser.get(userId);
    if (!visibleSockets) return;
    visibleSockets.delete(socketId);
    if (visibleSockets.size === 0) this.visibleSocketsByUser.delete(userId);
  }

  clearAllForUser(userId: string): void {
    this.focus.delete(userId);
    this.visibleSocketsByUser.delete(userId);
    for (const [socketId, ownerId] of this.socketOwners.entries()) {
      if (ownerId === userId) this.socketOwners.delete(socketId);
    }
  }
}
