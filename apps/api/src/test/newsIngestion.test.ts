import assert from "node:assert/strict";
import { test } from "node:test";
import { ingestSource } from "../services/news/ingestionService";
import { getNewsSourceAdapter, registerNewsSourceAdapter } from "../services/news/adapterRegistry";
import type { NewsDocumentRepository, NewsSource, NewsSourceAdapter, RetrievedNewsDocument } from "../services/news/types";

const source: NewsSource = {
  id: "source-1", key: "test-feed", name: "Test feed", organization: "Example Exchange",
  jurisdiction: "IN", category: "EXCHANGE", accessMethod: "RSS", officialUrl: "https://example.test",
  enabled: true, retrievalConfig: {},
};

const item = (overrides: Partial<RetrievedNewsDocument> = {}): RetrievedNewsDocument => ({
  externalId: "announcement-1", title: "Quarterly results", summary: "Results filed", content: "Revenue increased.",
  canonicalUrl: "https://example.test/announcement-1", publishedAt: "2026-11-06T10:00:00Z", sourceMetadata: { symbol: "ABC" },
  ...overrides,
});

function memoryRepository(): NewsDocumentRepository & { documents: Array<Record<string, unknown>>; failures: Array<Record<string, unknown>> } {
  const documents: Array<Record<string, unknown>> = [];
  const failures: Array<Record<string, unknown>> = [];
  return {
    documents,
    failures,
    async findDocument(sourceId, externalId) { return (documents.find((d) => d.sourceId === sourceId && d.externalId === externalId) as { id: string; contentHash: string } | undefined) ?? null; },
    async findByHash(sourceId, contentHash) { return documents.find((d) => d.sourceId === sourceId && d.contentHash === contentHash) as { id: string; contentHash: string } | undefined ?? null; },
    async createDocument(input) { documents.push({ ...input, id: `doc-${documents.length + 1}` }); },
    async recordFailure(input) { failures.push(input); },
    async markRetrieved() {},
  };
}

function adapter(retrieve: NewsSourceAdapter["retrieve"]): NewsSourceAdapter {
  return { sourceKey: source.key, retrieve };
}

test("ingests available source documents with publication/retrieval timestamps and a stable hash", async () => {
  const repository = memoryRepository();
  const result = await ingestSource(source, adapter(async () => [item()]), repository, { now: () => new Date("2026-11-06T12:00:00Z") });
  assert.deepEqual(result, { retrieved: 1, inserted: 1, duplicates: 0, failed: 0 });
  assert.equal(new Date(String(repository.documents[0].publishedAt)).toISOString(), "2026-11-06T10:00:00.000Z");
  assert.equal(new Date(String(repository.documents[0].retrievedAt)).toISOString(), "2026-11-06T12:00:00.000Z");
  assert.match(String(repository.documents[0].contentHash), /^[a-f0-9]{64}$/);
});

test("duplicate external IDs and identical content are skipped", async () => {
  const repository = memoryRepository();
  const run = (docs: RetrievedNewsDocument[]) => ingestSource(source, adapter(async () => docs), repository);
  await run([item()]);
  assert.deepEqual(await run([item()]), { retrieved: 1, inserted: 0, duplicates: 1, failed: 0 });
  assert.deepEqual(await run([item({ externalId: "another-id" })]), { retrieved: 1, inserted: 0, duplicates: 1, failed: 0 });
  assert.equal(repository.documents.length, 1);
});

test("retries transient retrieval failures before a successful ingest", async () => {
  const repository = memoryRepository();
  let calls = 0;
  const result = await ingestSource(source, adapter(async () => {
    calls += 1;
    if (calls < 3) throw new Error("temporary upstream failure");
    return [item()];
  }), repository, { retryDelayMs: 0, sleep: async () => {} });
  assert.equal(calls, 3);
  assert.equal(result.inserted, 1);
  assert.equal(repository.failures.length, 0);
});

test("retries transient persistence failures before recording a document", async () => {
  const repository = memoryRepository();
  const create = repository.createDocument.bind(repository);
  let attempts = 0;
  repository.createDocument = async (input) => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary database failure");
    await create(input);
  };
  const result = await ingestSource(source, adapter(async () => [item()]), repository, { retryDelayMs: 0, sleep: async () => {} });
  assert.equal(attempts, 2);
  assert.equal(result.inserted, 1);
  assert.equal(repository.failures.length, 0);
});

test("malformed documents are logged without stopping later documents", async () => {
  const repository = memoryRepository();
  const result = await ingestSource(source, adapter(async () => [item({ title: "" }), item({ externalId: "ok-2" })]), repository);
  assert.deepEqual(result, { retrieved: 2, inserted: 1, duplicates: 0, failed: 1 });
  assert.equal(repository.failures[0].stage, "document");
});

test("source failures retry, are recorded, and return a failed result", async () => {
  const repository = memoryRepository();
  let calls = 0;
  const result = await ingestSource(source, adapter(async () => { calls += 1; throw new Error("feed unavailable"); }), repository, { maxAttempts: 3, retryDelayMs: 0, sleep: async () => {} });
  assert.equal(calls, 3);
  assert.deepEqual(result, { retrieved: 0, inserted: 0, duplicates: 0, failed: 1 });
  assert.deepEqual(repository.failures[0], { sourceId: source.id, externalId: null, stage: "retrieve", message: "feed unavailable", attempts: 3 });
});

test("disabled sources and adapters for a different source are rejected", async () => {
  const repository = memoryRepository();
  await assert.rejects(ingestSource({ ...source, enabled: false }, adapter(async () => []), repository), /disabled/);
  await assert.rejects(ingestSource(source, { sourceKey: "other", retrieve: async () => [] }, repository), /cannot retrieve/);
});

test("adapter registry rejects duplicate registrations and reports missing adapters", () => {
  const uniqueAdapter = { sourceKey: "registry-test", retrieve: async () => [] } satisfies NewsSourceAdapter;
  registerNewsSourceAdapter(uniqueAdapter);
  assert.equal(getNewsSourceAdapter("registry-test"), uniqueAdapter);
  assert.throws(() => registerNewsSourceAdapter(uniqueAdapter), /already registered/);
  assert.throws(() => getNewsSourceAdapter("missing-test"), /No news adapter/);
});
