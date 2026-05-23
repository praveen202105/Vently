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

// Free public TURN by Metered's Open Relay Project (no signup, no card).
// Rate-limited so not high-traffic-production grade, but works for demos +
// early users where calls need to traverse NATs. Paid TURN takes precedence
// whenever TURN_PROVIDER is set.
const OPEN_RELAY_TURN: IceServerConfig[] = [
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

@Injectable()
export class IceService {
  private readonly logger = new Logger(IceService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Returns a list of ICE servers for the client to use. In production this
   * mints short-lived TURN credentials from the configured provider
   * (Cloudflare Calls or Metered.ca). Without provider config, falls back to
   * public STUN + the Open Relay free TURN — enough to land calls across
   * NATs while staying free.
   */
  async getIceServers(): Promise<IceServerConfig[]> {
    const provider = this.config.get<string>('TURN_PROVIDER');
    const apiKey = this.config.get<string>('TURN_API_KEY');
    const appId = this.config.get<string>('TURN_APP_ID');

    if (!provider || !apiKey) {
      this.logger.log('Using Open Relay public TURN (no provider configured)');
      return [...PUBLIC_STUN, ...OPEN_RELAY_TURN];
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
      this.logger.error('Failed to fetch TURN credentials, falling back to Open Relay', err);
    }

    return [...PUBLIC_STUN, ...OPEN_RELAY_TURN];
  }
}
