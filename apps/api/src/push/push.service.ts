import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webPush from 'web-push';
import { PushRepository } from './push.repository.js';

export interface PushPayload {
  title: string;
  body: string;
  // Where to navigate when the user clicks the notification. The service
  // worker reads this from event.notification.data.
  url?: string;
  // Used to group/replace notifications on the OS level — e.g. multiple
  // messages in the same conversation stack instead of spawning N pings.
  tag?: string;
  // For call notifications: keep the notification visible until the user
  // interacts where supported.
  requireInteraction?: boolean;
}

/**
 * Sends Web Push notifications to a user's registered devices.
 *
 * Wire-up:
 *  - VAPID_PUBLIC_KEY  — share with the frontend (NEXT_PUBLIC_VAPID_PUBLIC_KEY).
 *  - VAPID_PRIVATE_KEY — server-only; signs every push.
 *  - VAPID_SUBJECT     — required by the spec (mailto: contact for browser
 *                        push services to contact us if our pushes misbehave).
 *
 * When any of the three are missing in env (e.g. local dev without VAPID
 * keys generated yet), sendToUser is a silent no-op so the rest of the
 * app still works. Tests don't care; real prod has them set on Railway.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly repo: PushRepository,
  ) {}

  onModuleInit() {
    const pub = this.config.get<string>('VAPID_PUBLIC_KEY');
    const priv = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    if (!pub || !priv || !subject) {
      this.logger.warn(
        'VAPID keys missing — push notifications disabled. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.',
      );
      return;
    }
    webPush.setVapidDetails(subject, pub, priv);
    this.enabled = true;
    this.logger.log('Web push enabled');
  }

  /**
   * Send a notification to every device the user has registered.
   * Dead subscriptions (HTTP 410/404) are pruned automatically.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    const subs = await this.repo.findByUser(userId);
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 410 Gone / 404 Not Found = subscription is dead at the push
          // service. Prune so we don't keep retrying. Other errors are
          // logged but not pruned (could be transient — DNS, throttling).
          if (status === 410 || status === 404) {
            await this.repo.deleteByEndpoint(sub.endpoint);
            this.logger.log(`pruned dead push subscription (status ${status})`);
          } else {
            this.logger.warn(
              `web-push failed (status ${status ?? '?'}): ${(err as Error).message}`,
            );
          }
        }
      }),
    );
  }
}
