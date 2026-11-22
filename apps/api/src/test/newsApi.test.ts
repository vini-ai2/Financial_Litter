import assert from "node:assert/strict";
import { test } from "node:test";
import prisma from "../lib/prisma";
import { newsPreferencesSchema } from "../controllers/newsController";
import { buildEventContextualExplanation, getNewsEvent, listNewsEvents, summarizeNewsSourceHealth } from "../services/news/newsApiService";
import { buildNewsEventWhere, newsFilterSchema, paginationWindow } from "../services/news/newsQuery";

test("source health reports last success, stored item counts and failures only when they are current", () => {
  const now = Date.parse("2026-11-22T12:00:00.000Z");
  const source = { name: "RBI releases", organization: "Reserve Bank of India", officialUrl: "https://rbi.org.in/", accessMethod: "RSS", lastRetrievedAt: new Date(now - 60_000), documentCount: 10, evidenceCount: 6 };
  const failure = { occurredAt: new Date(now - 30_000), stage: "retrieve", attempts: 3, message: "HTTP 503" };
  const error = summarizeNewsSourceHealth(source, failure, now);
  assert.equal(error.status, "ERROR");
  assert.equal(error.documentCount, 10);
  assert.equal(error.evidenceCount, 6);
  assert.equal(error.lastSuccessfulFetchAt?.getTime(), source.lastRetrievedAt?.getTime());
  assert.equal(error.latestFailureMessage, "HTTP 503");
  assert.equal(error.attempts, 3);

  const recovered = summarizeNewsSourceHealth({ ...source, lastRetrievedAt: new Date(now - 10_000) }, failure, now);
  assert.equal(recovered.status, "CURRENT");
  assert.equal(recovered.latestFailureMessage, null);
  assert.equal(recovered.attempts, null);
  const processingIssue = summarizeNewsSourceHealth(source, undefined, now, { occurredAt: new Date(now), stage: "intelligence:event-persistence", attempts: 1, message: "Transient event write failure" });
  assert.equal(processingIssue.status, "CURRENT");
  assert.equal(processingIssue.latestProcessingFailureMessage, "Transient event write failure");
});

test("contextual briefs retain sourced facts and qualify category-based interpretation", () => {
  const brief = buildEventContextualExplanation("MARKET_ECONOMIC", "RBI monetary policy update", "Repo rate decision published by RBI.", ["Reserve Bank of India"], ["evidence-1"]);
  assert.equal(brief.whatHappened, "Repo rate decision published by RBI.");
  assert.match(brief.consumerContext, /If this concerns policy rates/);
  assert.match(brief.uncertainty, /not a sourced prediction/);
  assert.deepEqual(brief.evidenceIds, ["evidence-1"]);
});

test("news filters validate and build category, company, region and inclusive date predicates", () => {
  const parsed = newsFilterSchema.safeParse({
    page: "3", pageSize: "10", category: "EARNINGS", region: "in", company: "entity-7",
    from: "2026-01-01", to: "2026-01-31",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.region, "IN");
  assert.deepEqual(paginationWindow(parsed.data), { skip: 20, take: 10 });
  const where = buildNewsEventWhere(parsed.data);
  assert.equal(where.currentRevision?.eventType, "EARNINGS");
  const dateRange = where.currentRevision?.eventDate as { gte?: Date; lte?: Date };
  assert.equal(dateRange.gte?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(dateRange.lte?.toISOString(), "2026-01-31T23:59:59.999Z");
  assert.equal(where.currentRevision?.entities?.some?.entity?.OR?.[0]?.id, "entity-7");
  assert.equal(where.currentRevision?.OR?.length, 2);
});

test("news filter parser rejects invalid dates, inverted ranges and excessive page sizes", () => {
  assert.equal(newsFilterSchema.safeParse({ from: "2026-02-30" }).success, false);
  assert.equal(newsFilterSchema.safeParse({ from: "2026-02-02", to: "2026-02-01" }).success, false);
  assert.equal(newsFilterSchema.safeParse({ pageSize: "51" }).success, false);
  assert.equal(newsFilterSchema.safeParse({ q: "repo rate" }).success, true);
  assert.equal(newsFilterSchema.safeParse({ q: "  " }).success, false);
});

test("news preferences accept categories and regions without duplicates", () => {
  const parsed = newsPreferencesSchema.safeParse({ categories: ["EARNINGS", "RISK"], regions: ["in", "US"] });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.deepEqual(parsed.data.regions, ["IN", "US"]);
  assert.equal(newsPreferencesSchema.safeParse({ categories: ["EARNINGS", "EARNINGS"], regions: [] }).success, false);
  assert.equal(newsPreferencesSchema.safeParse({ categories: ["NOT_A_CATEGORY"], regions: [] }).success, false);
  assert.equal(newsPreferencesSchema.safeParse({ categories: [], regions: [], topics: ["inflation", "Inflation"] }).success, false);
});

test("news routes place authentication middleware before all API handlers", async () => {
  process.env.JWT_SECRET = "news-api-test-secret";
  try {
    const [{ default: router }, { authenticate }] = await Promise.all([
      import("../routes/news.js"),
      import("../middleware/authMiddleware.js"),
    ]);
    const stack = (router as unknown as { stack: Array<{ handle: unknown }> }).stack;
    assert.equal(stack[0]?.handle, authenticate);
    assert.ok(stack.length > 1);
  } finally {
    delete process.env.JWT_SECRET;
  }
});

test("market feed paginates sourced events and reports empty feeds without synthetic content", async () => {
  const delegate = prisma.newsEvent;
  const previousFind = Object.getOwnPropertyDescriptor(delegate, "findMany");
  const previousCount = Object.getOwnPropertyDescriptor(delegate, "count");
  let query: any;
  Object.defineProperty(delegate, "findMany", { configurable: true, value: async (value: unknown) => { query = value; return []; } });
  Object.defineProperty(delegate, "count", { configurable: true, value: async () => 0 });
  try {
    const result = await listNewsEvents(newsFilterSchema.parse({ page: 2, pageSize: 15 }), "user-1");
    assert.deepEqual(query.skip, 15);
    assert.equal(query.take, 15);
    assert.deepEqual(result, { items: [], total: 0, page: 2, pageSize: 15, totalPages: 0 });
  } finally {
    if (previousFind) Object.defineProperty(delegate, "findMany", previousFind);
    else delete (delegate as unknown as { findMany?: unknown }).findMany;
    if (previousCount) Object.defineProperty(delegate, "count", previousCount);
    else delete (delegate as unknown as { count?: unknown }).count;
  }
});

test("source provenance, verification language and revision history are returned for detail views", async () => {
  const delegate = prisma.newsEvent;
  const previous = Object.getOwnPropertyDescriptor(delegate, "findUnique");
  const historyDelegate = prisma.newsReadHistory;
  const previousHistory = Object.getOwnPropertyDescriptor(historyDelegate, "upsert");
  const savedDelegate = prisma.newsSavedEvent;
  const previousSaved = Object.getOwnPropertyDescriptor(savedDelegate, "findUnique");
  const source = { id: "source-1", name: "Official Exchange", organization: "Example Exchange", officialUrl: "https://example.test", jurisdiction: "IN" };
  const doc = { id: "doc-1", title: "Filing", canonicalUrl: "https://example.test/filing", sourceId: source.id, source, publishedAt: new Date("2026-01-02T10:00:00Z"), retrievedAt: new Date("2026-01-02T10:01:00Z"), contentHash: "a".repeat(64) };
  const revision = { id: "rev-2", version: 2, revisionType: "CORRECTION", eventType: "EARNINGS", classificationConfidence: 0.86, materiality: "MEDIUM", title: "Corrected filing", summary: "Corrected earnings", eventDate: doc.publishedAt, facts: [{ type: "EARNINGS", value: "Net profit corrected" }], entities: [], documents: [{ document: doc }], evidence: [{ documentId: doc.id, sourceId: source.id, field: "content", startOffset: 0, endOffset: 22, quote: "Net profit corrected", source }], createdAt: new Date("2026-01-03T10:00:00Z") };
  Object.defineProperty(delegate, "findUnique", { configurable: true, value: async () => ({ id: "event-1", currentRevision: revision, revisions: [{ ...revision, version: 1, revisionType: "INITIAL", title: "Original filing", evidence: [], documents: [{ document: doc }] }, revision] }) });
  Object.defineProperty(historyDelegate, "upsert", { configurable: true, value: async () => ({}) });
  Object.defineProperty(savedDelegate, "findUnique", { configurable: true, value: async () => null });
  try {
    const result = await getNewsEvent("event-1", "user-1");
    assert.equal(result?.verificationStatus, "SOURCE_LINKED");
    assert.match(result?.verificationNote ?? "", /not independently fact-checked/);
    assert.equal(result?.supportingSources[0].sourceName, source.name);
    assert.equal(result?.supportingSources[0].publishedAt, doc.publishedAt);
    assert.equal(result?.supportingSources[0].retrievedAt, doc.retrievedAt);
    assert.deepEqual(result?.revisions.map((item: any) => item.type), ["INITIAL", "CORRECTION"]);
    assert.equal(result?.supportingEvidence[0].quote, "Net profit corrected");
    assert.equal(result?.sourceReliability.status, "UNASSESSED");
    assert.match(result?.explanation.whyItMatters ?? "", /reported period/);
  } finally {
    if (previous) Object.defineProperty(delegate, "findUnique", previous);
    else delete (delegate as unknown as { findUnique?: unknown }).findUnique;
    if (previousHistory) Object.defineProperty(historyDelegate, "upsert", previousHistory);
    else delete (historyDelegate as unknown as { upsert?: unknown }).upsert;
    if (previousSaved) Object.defineProperty(savedDelegate, "findUnique", previousSaved);
    else delete (savedDelegate as unknown as { findUnique?: unknown }).findUnique;
  }
});
