import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private client: Groq | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const key = this.config.get<string>('GROQ_API_KEY');
    if (!key) {
      this.logger.warn(
        'GROQ_API_KEY missing — bio embeddings will fall back to local token similarity.'
      );
      return;
    }
    this.client = new Groq({ apiKey: key });
    this.logger.log('Embedding service enabled (Groq / nomic-embed-text-v1.5)');
  }

  async generate(text: string): Promise<number[] | null> {
    if (!this.client || !text || !text.trim()) {
      return null;
    }

    try {
      const response = await this.client.embeddings.create({
        model: 'nomic-embed-text-v1.5',
        input: text,
      });
      const embedding = response.data[0]?.embedding;
      return Array.isArray(embedding) ? embedding : null;
    } catch (err) {
      this.logger.warn(`Failed to generate embedding: ${(err as Error).message}`);
      return null;
    }
  }

  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
      return 0.5; // neutral fallback
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const valA = vecA[i] ?? 0;
      const valB = vecB[i] ?? 0;
      dotProduct += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }

    if (normA === 0 || normB === 0) {
      return 0.5; // neutral fallback
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    // Normalize cosine similarity from [-1, 1] to [0, 1]
    return (similarity + 1) / 2;
  }

  textSimilarity(textA: string, textB: string): number {
    const normalize = (t: string) =>
      t
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(Boolean);

    const tokensA = new Set(normalize(textA || ''));
    const tokensB = new Set(normalize(textB || ''));

    if (tokensA.size === 0 && tokensB.size === 0) {
      return 1.0;
    }

    const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.size / union.size;
  }
}
