import type Redis from 'ioredis';
import { AIPeerService } from './ai-peer.service.js';

describe('AIPeerService', () => {
  let store: Map<string, string>;
  let redis: {
    exists: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    scan: jest.Mock;
    ttl: jest.Mock;
  };
  let service: AIPeerService;

  beforeEach(() => {
    store = new Map<string, string>();
    redis = {
      exists: jest.fn(async (key: string) => (store.has(key) ? 1 : 0)),
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      del: jest.fn(async (...keys: string[]) => {
        let deleted = 0;
        for (const key of keys) {
          if (store.delete(key)) deleted += 1;
        }
        return deleted;
      }),
      scan: jest.fn(async () => [
        '0',
        [...store.keys()].filter((key) => key.startsWith('aichat:conv:')),
      ]),
      ttl: jest.fn(async () => 300),
    };
    service = new AIPeerService(redis as unknown as Redis);
  });

  it('clears the user cooldown when an AI conversation is ended', async () => {
    const peer = await service.spawn({
      userId: 'user-a',
      mood: 'NEED_TO_TALK',
      myGender: 'MALE',
    });

    expect(peer).not.toBeNull();
    expect(await service.isRateLimited('user-a')).toBe(true);

    await service.evict(peer!.conversationId);

    expect(redis.del).toHaveBeenCalledWith(
      `aichat:conv:${peer!.conversationId}`,
      `aichat:hist:${peer!.conversationId}`,
      `aichat:greeted:${peer!.conversationId}`,
      'aichat:rl:user-a',
      'aichat:user:user-a',
    );
    expect(await service.isRateLimited('user-a')).toBe(false);
  });

  it('reuses an active AI conversation when the user searches again', async () => {
    const first = await service.spawn({
      userId: 'user-a',
      mood: 'NEED_TO_TALK',
      myGender: 'MALE',
    });

    const second = await service.spawn({
      userId: 'user-a',
      mood: 'FRIENDSHIP',
      myGender: 'MALE',
    });

    expect(second).toEqual(first);
  });

  it('recovers active AI conversations created before the user index existed', async () => {
    const first = await service.spawn({
      userId: 'user-a',
      mood: 'NEED_TO_TALK',
      myGender: 'MALE',
    });
    store.delete('aichat:user:user-a');

    const recovered = await service.findActiveForUser('user-a', { scanLegacySessions: true });

    expect(recovered?.conversationId).toBe(first!.conversationId);
    expect(store.get('aichat:user:user-a')).toBe(first!.conversationId);
  });
});
