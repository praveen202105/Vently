import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

const LOCAL_EMBEDDING_DIM = 128;

const SEMANTIC_HINTS: Array<[string, RegExp, number]> = [
  [
    'language:hinglish',
    /\b(haan|acha|arre|yaar|matlab|kya|scene|thoda|nahi|neend|raat|dil|yaad|ghar|samj)\b/i,
    2.2,
  ],
  ['style:short_reply', /\b(short|small|one line|chota|chhota|long mat|zyada long mat)\b/i, 2.4],
  [
    'style:listening',
    /\b(no advice|advice mat|lecture mat|solution mat|bas sun|just listen)\b/i,
    2.4,
  ],
  ['topic:relationship', /\b(breakup|ex|miss|yaad|left|relationship|love|pyaar|dil)\b/i, 2.2],
  ['topic:work', /\b(work|job|boss|office|career|startup)\b/i, 2.0],
  ['topic:study', /\b(study|exam|college|assignment|semester)\b/i, 2.0],
  ['topic:family', /\b(family|parents|mom|dad|ghar)\b/i, 2.0],
  ['topic:sleep_late_night', /\b(neend|sleep|raat|late night|insomnia|awake)\b/i, 2.3],
  ['topic:entertainment', /\b(music|song|movie|series|anime|game|gaming)\b/i, 1.8],
  ['tone:flirty', /\b(flirt|flirty|cute|tease|naughty|spicy|romantic|close|hug)\b/i, 2.1],
  [
    'boundary:mature_chat',
    /\b(dirty|sexual|sext|sexting|sex|nude|nudes|horny|boobs|dick|pussy|cock|lund|chut)\b/i,
    2.4,
  ],
  ['mood:lonely', /\b(lonely|alone|akela|akeli|sad|heavy|empty)\b/i, 1.9],
  ['mood:advice', /\b(advice|help|suggest|solution|problem|kya karu|guide)\b/i, 1.8],
  ['mood:voice', /\b(call|voice|video|talk|bolna|sunna)\b/i, 1.7],
];

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private client: Groq | null = null;
  private embeddingModel: string | null = null;
  private remoteEmbeddingDisabled = false;
  private remoteFailureWarned = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const key = this.config.get<string>('GROQ_API_KEY');
    const model = this.config.get<string>('GROQ_EMBEDDING_MODEL')?.trim();
    this.embeddingModel = model || null;

    if (!key || !this.embeddingModel) {
      this.logger.log('Embedding service using local semantic hash embeddings.');
      return;
    }

    this.client = new Groq({ apiKey: key });
    this.logger.log(`Embedding service enabled (Groq / ${this.embeddingModel})`);
  }

  async generate(text: string): Promise<number[] | null> {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    if (this.client && this.embeddingModel && !this.remoteEmbeddingDisabled) {
      try {
        const response = await this.client.embeddings.create({
          model: this.embeddingModel,
          input: trimmed,
        });
        const embedding = response.data[0]?.embedding;
        if (Array.isArray(embedding)) return embedding;
      } catch (err) {
        this.handleRemoteFailure(err);
      }
    }

    return this.generateLocalEmbedding(trimmed);
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

  private handleRemoteFailure(err: unknown): void {
    const message = (err as Error).message ?? String(err);
    if (/model_not_found|does not exist|not have access/i.test(message)) {
      this.remoteEmbeddingDisabled = true;
    }

    if (!this.remoteFailureWarned) {
      this.logger.warn(`Remote embedding failed; using local fallback: ${message}`);
      this.remoteFailureWarned = true;
    }
  }

  private generateLocalEmbedding(text: string): number[] {
    const vector = Array.from({ length: LOCAL_EMBEDDING_DIM }, () => 0);
    const tokens = this.tokenize(text);

    for (const token of tokens) {
      this.addFeature(vector, `tok:${token}`, 1);
    }

    for (let i = 0; i < tokens.length - 1; i += 1) {
      this.addFeature(vector, `bi:${tokens[i]}_${tokens[i + 1]}`, 0.75);
    }

    for (const [feature, pattern, weight] of SEMANTIC_HINTS) {
      if (pattern.test(text)) this.addFeature(vector, feature, weight);
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm === 0) return vector;
    return vector.map((value) => Number((value / norm).toFixed(6)));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((token) => this.normalizeToken(token))
      .filter((token) => token.length > 1);
  }

  private normalizeToken(token: string): string {
    if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
    if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
    if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
    return token;
  }

  private addFeature(vector: number[], feature: string, weight: number): void {
    const hash = this.hash(feature);
    const index = hash % LOCAL_EMBEDDING_DIM;
    const sign = hash & 1 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign * weight;
  }

  private hash(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}
