import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const PUBLIC_STUN: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

@Injectable()
export class IceService {
  private readonly logger = new Logger(IceService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Returns a list of ICE servers for the client to use. In production this
   * mints short-lived TURN credentials from the configured provider
   * (Cloudflare Calls or Metered.ca). In dev without provider config, falls
   * back to public STUN — works on the same network but will fail across
   * NATs without TURN.
   */
  async getIceServers(): Promise<IceServerConfig[]> {
    const provider = this.config.get<string>('TURN_PROVIDER');
    const apiKey = this.config.get<string>('TURN_API_KEY');
    const appId = this.config.get<string>('TURN_APP_ID');

    if (!provider || !apiKey) {
      this.logger.warn('No TURN provider configured — falling back to public STUN only');
      return PUBLIC_STUN;
    }

    try {
      if (provider === 'metered' && appId) {
        const res = await fetch(
          `https://${appId}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
        );
        if (!res.ok) throw new Error(`Metered HTTP ${res.status}`);
        const data = (await res.json()) as IceServerConfig[];
        return [...PUBLIC_STUN, ...data];
      }

      if (provider === 'cloudflare' && appId) {
        const res = await fetch(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${appId}/credentials/generate`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ttl: 3600 }),
          },
        );
        if (!res.ok) throw new Error(`Cloudflare HTTP ${res.status}`);
        const data = (await res.json()) as { iceServers: IceServerConfig };
        return [...PUBLIC_STUN, ...(Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers])];
      }
    } catch (err) {
      this.logger.error('Failed to fetch TURN credentials', err);
    }

    return PUBLIC_STUN;
  }
}
