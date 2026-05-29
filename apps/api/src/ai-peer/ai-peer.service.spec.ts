import type Redis from 'ioredis';
import { AIPeerService } from './ai-peer.service.js';

describe('AIPeerService', () => {
  let store: Map<string, string>;
  let redis: {
    exists: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
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
    );
    expect(await service.isRateLimited('user-a')).toBe(false);
  });
});
