import { Injectable, Logger } from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Per-user, per-event in-memory sliding-window throttler for socket handlers.
 * REST routes are covered by @nestjs/throttler; sockets aren't, so without
 * this an authenticated user could flood chat:send / call:invite and starve
 * the event loop or rack up moderation work.
 *
 * In-memory is fine for the current single-instance API; on horizontal scale
 * this would move to Redis (INCR with TTL). The bucket map is cleaned lazily
 * on access — there's no separate sweeper because each user touches a
 * limited set of (userId, event) keys.
 */
@Injectable()
export class SocketThrottleService {
  private readonly logger = new Logger(SocketThrottleService.name);
  private readonly buckets = new Map<string, Bucket>();

  /**
   * @returns true if the request fits inside the window, false to reject.
   */
  allow(userId: string, event: string, limit: number, windowMs: number): boolean {
    const key = `${userId}:${event}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (bucket.count >= limit) {
      this.logger.warn(`throttle: ${userId} hit ${event} cap (${limit}/${windowMs}ms) — dropping`);
      return false;
    }

    bucket.count += 1;
    return true;
  }
}
