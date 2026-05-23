import { api } from '@/lib/api/client';

interface IceServersResponse {
  iceServers: RTCIceServer[];
}

let cached: { servers: RTCIceServer[]; expiresAt: number } | null = null;
const TTL_MS = 50 * 60 * 1000; // refresh slightly before the 1h backend TTL.

export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.servers;
  const data = await api<IceServersResponse>('/webrtc/ice-servers');
  cached = { servers: data.iceServers, expiresAt: Date.now() + TTL_MS };
  return data.iceServers;
}
