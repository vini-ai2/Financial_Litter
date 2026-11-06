export type NewsSourceCategory = "EXCHANGE" | "REGULATOR" | "CENTRAL_BANK" | "GOVERNMENT" | "OTHER";
export type NewsAccessMethod = "RSS" | "API" | "LICENSED_FEED" | "MANUAL";

export type NewsSource = {
  id: string;
  key: string;
  name: string;
  organization: string;
  jurisdiction: string;
  category: NewsSourceCategory;
  accessMethod: NewsAccessMethod;
  officialUrl: string;
  enabled: boolean;
  retrievalConfig: unknown;
};

export type RetrievedNewsDocument = {
  externalId: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  canonicalUrl: string;
  publishedAt?: Date | string | null;
  sourceMetadata?: Record<string, unknown>;
};

export interface NewsSourceAdapter {
  readonly sourceKey: string;
  retrieve(source: NewsSource, options?: { signal?: AbortSignal }): Promise<RetrievedNewsDocument[]>;
}

export type NewsDocumentRepository = {
  findDocument(sourceId: string, externalId: string): Promise<{ id: string; contentHash: string } | null>;
  findByHash(sourceId: string, contentHash: string): Promise<{ id: string; contentHash: string } | null>;
  createDocument(input: {
    sourceId: string;
    externalId: string;
    title: string;
    summary: string | null;
    content: string | null;
    canonicalUrl: string;
    publishedAt: Date | null;
    retrievedAt: Date;
    contentHash: string;
    sourceMetadata: Record<string, unknown>;
  }): Promise<void>;
  recordFailure(input: { sourceId: string; externalId: string | null; stage: string; message: string; attempts: number }): Promise<void>;
  markRetrieved(sourceId: string, at: Date): Promise<void>;
};

export type IngestionResult = { retrieved: number; inserted: number; duplicates: number; failed: number };
