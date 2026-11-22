import assert from "node:assert/strict";
import { test } from "node:test";
import prisma from "../lib/prisma";
import { runNewsIngestion } from "../services/news/ingestionRunner";

const databaseUrl = process.env.DATABASE_URL;
let isolated = false;
try { const u = new URL(databaseUrl ?? ""); isolated = ["127.0.0.1", "localhost"].includes(u.hostname) && u.port === "5433" && u.pathname === "/finlitter_test"; } catch { /* requires the dedicated local database */ }

test("isolated RSS ingestion persists sourced evidence, classification and revisions once", { skip: !isolated }, async () => {
  const oldFetch = globalThis.fetch;
  const key = `pulse-pipeline-${Date.now()}`;
  const source = await prisma.newsSource.create({ data: { key, name: "Synthetic RSS integration fixture", organization: "Test fixture", jurisdiction: "IN", category: "OTHER", accessMethod: "RSS", officialUrl: "https://pulse-fixture.test", enabled: true, retrievalConfig: { feedUrl: "https://pulse-fixture.test/feed.xml", retainSummary: true } } });
  const failingSource = await prisma.newsSource.create({ data: { key: `${key}-failing`, name: "Synthetic failing RSS fixture", organization: "Test fixture", jurisdiction: "IN", category: "OTHER", accessMethod: "RSS", officialUrl: "https://pulse-fixture.test", enabled: true, retrievalConfig: { feedUrl: "http://pulse-fixture.test/feed.xml" } } });
  let eventIds: string[] = [];
  globalThis.fetch = async () => new Response(`<?xml version="1.0"?><rss><channel><item><title>RBI keeps repo rate unchanged — isolated test fixture</title><link>https://pulse-fixture.test/press/fixture-1</link><guid>fixture-1</guid><pubDate>Sun, 22 Nov 2026 08:00:00 GMT</pubDate><description><![CDATA[The Reserve Bank of India kept the repo rate unchanged. This synthetic fixture exists only in the isolated test database.]]></description></item></channel></rss>`, { status: 200 });
  try {
    const first = await runNewsIngestion([failingSource, source]);
    assert.equal(first.sources, 2); assert.equal(first.retrievalFailures, 1); assert.equal(first.retrieved, 1); assert.equal(first.inserted, 1); assert.equal(first.processedEvents, 1); assert.equal(first.processingFailures, 0);
    const docs = await prisma.newsDocument.findMany({ where: { sourceId: source.id }, include: { eventLinks: { include: { event: true } } } });
    assert.equal(docs.length, 1); assert.equal(docs[0].eventLinks.length, 1);
    const event = docs[0].eventLinks[0].event; eventIds = [event.id];
    const revision = await prisma.newsEventRevision.findUniqueOrThrow({ where: { id: event.currentRevisionId! }, include: { evidence: true, entities: { include: { entity: true } } } });
    assert.equal(revision.eventType, "MARKET_ECONOMIC");
    assert.ok(revision.entities.some(({ entity }) => entity.id === "pulse-reg-rbi"));
    assert.ok(revision.evidence.some((evidence) => evidence.quote.includes("repo rate unchanged")));
    assert.equal(docs[0].sourceMetadata && (docs[0].sourceMetadata as any).feedFormat, "RSS");
    assert.ok(docs[0].retrievedAt instanceof Date); assert.ok(docs[0].publishedAt instanceof Date);
    const second = await runNewsIngestion([source]);
    assert.equal(second.inserted, 0); assert.equal(second.duplicates, 1); assert.equal(second.processedEvents, 0);
    assert.equal(await prisma.newsEventRevision.count({ where: { eventId: event.id } }), 1);
  } finally {
    globalThis.fetch = oldFetch;
    try {
      await prisma.newsEventEvidence.deleteMany({ where: { revision: { eventId: { in: eventIds } } } });
      await prisma.newsEventDocument.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.newsEventEntity.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.newsEvent.updateMany({ where: { id: { in: eventIds } }, data: { currentRevisionId: null } });
      await prisma.newsEventRevision.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.newsEvent.deleteMany({ where: { id: { in: eventIds } } });
      await prisma.newsDocument.deleteMany({ where: { sourceId: source.id } });
      await prisma.newsIngestionFailure.deleteMany({ where: { sourceId: source.id } });
      await prisma.newsIngestionFailure.deleteMany({ where: { sourceId: failingSource.id } });
      await prisma.newsSource.delete({ where: { id: source.id } });
      await prisma.newsSource.delete({ where: { id: failingSource.id } });
    } catch (error) { console.error("Could not clean isolated RSS fixture", error); throw error; }
  }
});
