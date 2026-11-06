import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveEntities, type EntityCandidate } from "../services/news/entityResolution";
import { classifyEvent, extractEvent, type ExtractedEvent } from "../services/news/eventIntelligence";
import { planEventPersistence, processNewsDocument, type IntelligenceDocument, type NewsIntelligenceRepository } from "../services/news/newsIntelligenceService";

// Explicitly synthetic fixtures. These names and notices are test inputs, not market news.
const entities: EntityCandidate[] = [
  { id: "acme", canonicalName: "Acme Ltd", type: "COMPANY", aliases: ["Acme", "ABC"] },
  { id: "abc-bank", canonicalName: "ABC Bank", type: "COMPANY", aliases: ["ABC"] },
  { id: "rbi", canonicalName: "Reserve Bank of India", type: "REGULATOR", aliases: ["RBI"], identifiers: ["IN-RBI"] },
  { id: "tech-sector", canonicalName: "Technology", type: "SECTOR", aliases: ["Technology sector"] },
];

const document = (id: string, title: string, content = ""): IntelligenceDocument => ({
  id, sourceId: "fixture-source", title: `TEST FIXTURE — ${title}`, summary: null, content,
  publishedAt: new Date("2026-01-02T10:00:00Z"),
});

class MemoryIntelligenceRepository implements NewsIntelligenceRepository {
  readonly catalog = entities;
  readonly failures: Array<{ stage: string; message: string }> = [];
  readonly events = new Map<string, { id: string; version: number; revisionTypes: string[]; documents: string[] }>();
  readonly documents = new Map<string, { eventId: string; revisionId: string; version: number }>();
  private nextId = 0;

  async getEntityCatalog() { return this.catalog; }
  async recordFailure(input: { stage: string; message: string }) { this.failures.push(input); }
  async persistIntelligence(input: { document: IntelligenceDocument; event: ExtractedEvent }) {
    const prior = this.documents.get(input.document.id);
    if (prior) return { ...prior, outcome: "ALREADY_PROCESSED" as const };
    const key = input.event.dedupeKey ?? `unkeyed:${input.document.id}`;
    let current = this.events.get(key);
    let outcome: "CREATED" | "LINKED" | "REVISED";
    if (!current) {
      this.nextId += 1;
      current = { id: `event-${this.nextId}`, version: 1, revisionTypes: [input.event.revisionType], documents: [] };
      this.events.set(key, current);
      outcome = "CREATED";
    } else if (input.event.revisionType === "INITIAL") {
      outcome = "LINKED";
    } else {
      current.version += 1;
      current.revisionTypes.push(input.event.revisionType);
      outcome = "REVISED";
    }
    current.documents.push(input.document.id);
    const revisionId = `${current.id}-revision-${current.version}`;
    const result = { eventId: current.id, revisionId, version: current.version, outcome };
    this.documents.set(input.document.id, result);
    return result;
  }
}

test("entity resolution handles multiple entities, identifier aliases, and ambiguous aliases without assigning them", () => {
  const text = "Acme and RBI discussed IN-RBI filings; ABC reported results.";
  const matches = resolveEntities([{ field: "content", text }], entities);
  const resolved = matches.filter((match) => match.status === "RESOLVED");
  assert.deepEqual(new Set(resolved.map((match) => match.entityId)), new Set(["acme", "rbi"]));
  assert.ok(matches.some((match) => match.mention === "IN-RBI" && match.entityId === "rbi"));
  const ambiguous = matches.find((match) => match.mention === "ABC");
  assert.equal(ambiguous?.status, "AMBIGUOUS");
  assert.equal(ambiguous?.entityId, null);
  assert.deepEqual(new Set(ambiguous?.candidates), new Set(["acme", "abc-bank"]));
  const ambiguousEventSegments = [{ field: "title" as const, text: "ABC reports quarterly revenue" }];
  const ambiguousEventMatches = resolveEntities(ambiguousEventSegments, entities);
  const ambiguousEvent = extractEvent({ segments: ambiguousEventSegments, matches: ambiguousEventMatches });
  assert.equal(ambiguousEvent.dedupeKey, null);
  assert.deepEqual(ambiguousEvent.entities, []);
});

test("all supported event classes are deterministic", () => {
  const fixtures: Array<[string, string]> = [
    ["company development", "New contract signed and operations commenced"],
    ["earnings", "Quarterly financial results report net profit and revenue"],
    ["regulatory action", "SEBI issued a show cause notice and penalty"],
    ["market/economic", "RBI changed the repo rate amid inflation"],
    ["corporate action", "Board declared a dividend and buyback record date"],
    ["risk", "Credit downgrade after loan default and insolvency filing"],
  ];
  for (const [label, text] of fixtures) assert.ok(classifyEvent(text).eventType, label);
  assert.equal(classifyEvent(fixtures[0][1]).eventType, "COMPANY_DEVELOPMENT");
  assert.equal(classifyEvent(fixtures[1][1]).eventType, "EARNINGS");
  assert.equal(classifyEvent(fixtures[2][1]).eventType, "REGULATORY_ACTION");
  assert.equal(classifyEvent(fixtures[3][1]).eventType, "MARKET_ECONOMIC");
  assert.equal(classifyEvent(fixtures[4][1]).eventType, "CORPORATE_ACTION");
  assert.equal(classifyEvent(fixtures[5][1]).eventType, "RISK");
});

test("classification confidence is independent of materiality", () => {
  const brief = classifyEvent("Quarterly results: revenue reported");
  const detailed = classifyEvent("Quarterly results: revenue, net profit and EBITDA reported");
  assert.equal(brief.eventType, "EARNINGS");
  assert.equal(detailed.eventType, "EARNINGS");
  assert.ok(detailed.classificationConfidence > brief.classificationConfidence);
  assert.equal(brief.materiality, detailed.materiality);
  assert.notEqual(classifyEvent("Company reports revenue").materiality, classifyEvent("Substantial loss and insolvency risk").materiality);
});

test("extraction preserves supporting source text ranges and fails closed without a supported event", () => {
  const title = "TEST FIXTURE — Acme Ltd quarterly revenue update";
  const segments = [{ field: "title" as const, text: title }, { field: "content" as const, text: "Revenue was ₹12 crore." }];
  const matches = resolveEntities(segments, entities);
  const event = extractEvent({ segments, matches, publishedAt: new Date("2026-01-02T10:00:00Z") });
  for (const evidence of event.evidence) {
    const segment = segments.find((part) => part.field === evidence.field)!;
    assert.equal(segment.text.slice(evidence.startOffset, evidence.endOffset), evidence.quote);
  }
  assert.ok(event.facts.some((fact) => fact.value.includes("₹12 crore")));
  assert.throws(() => extractEvent({ segments: [{ field: "title", text: "TEST FIXTURE — Acme quarterly update" }], matches: [] }), /No supported/);
});

test("identical event documents are linked to one event; unrelated events remain separate", async () => {
  const repository = new MemoryIntelligenceRepository();
  const first = document("doc-1", "Acme Ltd quarterly revenue report", "Revenue increased by 12 percent.");
  const duplicate = document("doc-2", "Acme Ltd quarterly revenue report", "Revenue increased by 12 percent.");
  const unrelated = document("doc-3", "Acme Ltd board appointed a new director");
  const resultA = await processNewsDocument(first, repository);
  const resultB = await processNewsDocument(duplicate, repository);
  const resultC = await processNewsDocument(unrelated, repository);
  assert.equal(resultA.persisted.eventId, resultB.persisted.eventId);
  assert.equal(resultB.persisted.outcome, "LINKED");
  assert.notEqual(resultA.persisted.eventId, resultC.persisted.eventId);
  assert.equal(repository.events.size, 2);
  assert.equal(repository.events.get(resultA.event.dedupeKey!)?.documents.length, 2);
});

test("amendments, corrections and retractions create successive event revisions", async () => {
  const repository = new MemoryIntelligenceRepository();
  const titles = [
    "Acme Ltd quarterly revenue report",
    "Amended: Acme Ltd quarterly revenue report",
    "Correction: Acme Ltd quarterly revenue report",
    "Retraction: Acme Ltd quarterly revenue report",
  ];
  const results: Array<Awaited<ReturnType<typeof processNewsDocument>>> = [];
  for (let index = 0; index < titles.length; index += 1) {
    results.push(await processNewsDocument(document(`revision-${index}`, titles[index]), repository));
  }
  assert.deepEqual(results.map((result) => result.event.revisionType), ["INITIAL", "AMENDMENT", "CORRECTION", "RETRACTION"]);
  assert.ok(results.every((result) => result.persisted.eventId === results[0].persisted.eventId));
  assert.deepEqual(repository.events.get(results[0].event.dedupeKey!)?.revisionTypes, ["INITIAL", "AMENDMENT", "CORRECTION", "RETRACTION"]);
  assert.equal(repository.events.get(results[0].event.dedupeKey!)?.version, 4);
});

test("subsequent development is retained as a new revision, and duplicate processing is idempotent", async () => {
  const repository = new MemoryIntelligenceRepository();
  const initial = document("develop-1", "Acme Ltd quarterly revenue report");
  const update = document("develop-2", "Further update: Acme Ltd quarterly revenue report");
  const a = await processNewsDocument(initial, repository);
  const b = await processNewsDocument(update, repository);
  const repeated = await processNewsDocument(update, repository);
  assert.equal(b.event.revisionType, "DEVELOPMENT");
  assert.equal(b.persisted.version, 2);
  assert.equal(repeated.persisted.outcome, "ALREADY_PROCESSED");
  assert.equal(repository.events.get(a.event.dedupeKey!)?.version, 2);
});

test("event processing failures are recorded with a stage and source document", async () => {
  const repository = new MemoryIntelligenceRepository();
  await assert.rejects(processNewsDocument(document("bad-doc", "TEST FIXTURE — no classifiable event"), repository), /No supported/);
  assert.equal(repository.failures.length, 1);
  assert.equal(repository.failures[0].stage, "event-extraction-classification");
});

test("revision persistence policy distinguishes duplicate documents, new events, linked records and revisions", () => {
  const current = { eventId: "event-1", revisionId: "revision-1", version: 1 };
  assert.equal(planEventPersistence({ current: null, revisionType: "INITIAL", documentAlreadyProcessed: false }), "CREATE");
  assert.equal(planEventPersistence({ current, revisionType: "INITIAL", documentAlreadyProcessed: false }), "LINK");
  assert.equal(planEventPersistence({ current, revisionType: "CORRECTION", documentAlreadyProcessed: false }), "REVISE");
  assert.equal(planEventPersistence({ current, revisionType: "RETRACTION", documentAlreadyProcessed: true }), "ALREADY_PROCESSED");
});
