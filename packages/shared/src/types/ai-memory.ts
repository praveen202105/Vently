export interface AiMemoryStatus {
  enabled: boolean;
  chunkCount: number;
  lastUpdatedAt: string | null;
  retentionDays: number;
}
