import { createHash } from "node:crypto";
import type { NewsDocumentRepository, NewsSource, NewsSourceAdapter, RetrievedNewsDocument, IngestionResult } from "./types";

type IngestionOptions = {
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
};

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function normalizedDate(value: RetrievedNewsDocument["publishedAt"]): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid publication timestamp");
  return date;
}

function contentHash(document: RetrievedNewsDocument): string {
  const content = [document.title, document.summary ?? "", document.content ?? ""].join("\n").trim();
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function validateDocument(document: RetrievedNewsDocument): void {
  if (!document.externalId?.trim()) throw new Error("Missing source document identifier");
  if (!document.title?.trim()) throw new Error("Missing document title");
  if (!document.canonicalUrl?.trim()) throw new Error("Missing canonical document URL");
  try {
    const url = new URL(document.canonicalUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    throw new Error("Invalid canonical document URL");
  }
  normalizedDate(document.publishedAt);
}

async function withRetry<T>(work: () => Promise<T>, maxAttempts: number, retryDelayMs: number, sleep: (ms: number) => Promise<void>): Promise<{ value: T; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try { return { value: await work(), attempts: attempt }; }
    catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await sleep(retryDelayMs * 2 ** (attempt - 1));
    }
  }
  throw Object.assign(new Error(lastError instanceof Error ? lastError.message : "Retrieval failed"), { attempts: maxAttempts });
}

export async function ingestSource(
  source: NewsSource,
  adapter: NewsSourceAdapter,
  repository: NewsDocumentRepository,
  options: IngestionOptions = {},
): Promise<IngestionResult> {
  if (!source.enabled) throw new Error(`News source ${source.key} is disabled`);
  if (adapter.sourceKey !== source.key) throw new Error(`Adapter ${adapter.sourceKey} cannot retrieve ${source.key}`);

  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());
  let result: IngestionResult = { retrieved: 0, inserted: 0, duplicates: 0, failed: 0 };

  let documents: RetrievedNewsDocument[];
  try {
    const attempt = await withRetry(() => adapter.retrieve(source), maxAttempts, retryDelayMs, sleep);
    documents = attempt.value;
  } catch (error) {
    const attempts = (error as { attempts?: number }).attempts ?? maxAttempts;
    await repository.recordFailure({ sourceId: source.id, externalId: null, stage: "retrieve", message: error instanceof Error ? error.message : "Retrieval failed", attempts });
    return { ...result, failed: 1 };
  }

  result.retrieved = documents.length;
  for (const document of documents) {
    try {
      validateDocument(document);
      const hash = contentHash(document);
      const existing = await repository.findDocument(source.id, document.externalId);
      if (existing || await repository.findByHash(source.id, hash)) {
        result.duplicates += 1;
        continue;
      }
      await withRetry(() => repository.createDocument({
        sourceId: source.id,
        externalId: document.externalId.trim(),
        title: document.title.trim(),
        summary: document.summary ?? null,
        content: document.content ?? null,
        canonicalUrl: document.canonicalUrl,
        publishedAt: normalizedDate(document.publishedAt),
        retrievedAt: now(),
        contentHash: hash,
        sourceMetadata: document.sourceMetadata ?? {},
      }), maxAttempts, retryDelayMs, sleep);
      result.inserted += 1;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        result.duplicates += 1;
        continue;
      }
      result.failed += 1;
      await repository.recordFailure({
        sourceId: source.id,
        externalId: document.externalId || null,
        stage: "document",
        message: error instanceof Error ? error.message : "Document ingestion failed",
        attempts: (error as { attempts?: number }).attempts ?? 1,
      });
    }
  }

  await repository.markRetrieved(source.id, now());
  return result;
}
