import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let configGet: jest.Mock;

  beforeEach(async () => {
    configGet = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
      ],
    }).compile();

    service = module.get(EmbeddingService);
  });

  describe('cosineSimilarity', () => {
    it('returns normalized similarity of 1.0 for identical vectors', () => {
      const vec = [1, 2, 3];
      expect(service.cosineSimilarity(vec, vec)).toBeCloseTo(1.0);
    });

    it('returns normalized similarity of 0.5 for orthogonal vectors', () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      expect(service.cosineSimilarity(vecA, vecB)).toBeCloseTo(0.5);
    });

    it('returns normalized similarity of 0.0 for perfectly opposite vectors', () => {
      const vecA = [1, 1];
      const vecB = [-1, -1];
      expect(service.cosineSimilarity(vecA, vecB)).toBeCloseTo(0.0);
    });

    it('returns 0.5 neutral fallback for invalid inputs', () => {
      expect(service.cosineSimilarity([], [])).toBe(0.5);
      expect(service.cosineSimilarity([1], [])).toBe(0.5);
    });
  });

  describe('textSimilarity', () => {
    it('returns 1.0 Jaccard similarity for identical strings ignoring case and punctuation', () => {
      expect(
        service.textSimilarity('Hello, World! I love coding.', 'hello world i love coding'),
      ).toBeCloseTo(1.0);
    });

    it('returns correct overlap ratio for partially matching strings', () => {
      // union: {apple, banana, cherry} (3), intersection: {apple, banana} (2)
      // intersection / union = 2 / 3 = 0.666...
      expect(service.textSimilarity('apple banana', 'banana cherry apple')).toBeCloseTo(2 / 3);
    });

    it('returns 0.0 for completely disjoint strings', () => {
      expect(service.textSimilarity('apple', 'orange banana')).toBeCloseTo(0.0);
    });

    it('returns 1.0 for empty strings', () => {
      expect(service.textSimilarity('', '')).toBeCloseTo(1.0);
    });
  });

  describe('generate', () => {
    it('returns a local embedding if Gemini key is not configured', async () => {
      service.onModuleInit();

      const embedding = await service.generate('some bio text');

      expect(embedding).toHaveLength(128);
      expect(embedding?.some((value) => value !== 0)).toBe(true);
    });

    it('returns null for empty or white-spaced bio inputs', async () => {
      expect(await service.generate('')).toBeNull();
      expect(await service.generate('   ')).toBeNull();
    });

    it('uses configured Gemini embeddings when available', async () => {
      configGet.mockImplementation((key: string) => {
        if (key === 'GEMINI_API_KEY') return 'test-gemini-key';
        if (key === 'GEMINI_EMBEDDING_MODEL') return 'gemini-embedding-001';
        return undefined;
      });
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }),
      } as Response);
      service.onModuleInit();

      const embedding = await service.generate('relationship advice');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-goog-api-key': 'test-gemini-key',
          }),
          body: JSON.stringify({
            model: 'models/gemini-embedding-001',
            content: {
              parts: [{ text: 'relationship advice' }],
            },
          }),
        }),
      );
      expect(embedding).toEqual([0.1, 0.2, 0.3]);
      fetchMock.mockRestore();
    });

    it('falls back locally and disables Gemini calls when the configured model is unavailable', async () => {
      configGet.mockImplementation((key: string) => {
        if (key === 'GEMINI_API_KEY') return 'test-gemini-key';
        if (key === 'GEMINI_EMBEDDING_MODEL') return 'missing-embedding-model';
        return undefined;
      });
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: { message: 'model_not_found: does not exist' } }),
      } as Response);
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      service.onModuleInit();

      const first = await service.generate('neend nahi aa rhi');
      const second = await service.generate('neend nahi aa rhi');

      expect(first).toHaveLength(128);
      expect(second).toHaveLength(128);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
      fetchMock.mockRestore();
      warn.mockRestore();
    });
  });
});
