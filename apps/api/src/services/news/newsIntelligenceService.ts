import type { EntityCandidate, EntityMatch, TextSegment } from "./entityResolution";
import { resolveEntities } from "./entityResolution";
import { extractEvent, type ExtractedEvent } from "./eventIntelligence";

export type IntelligenceDocument = {
  id: string;
  sourceId: string;
  title: string;
  summary: string | null;
  content: string | null;
  publishedAt: Date | null;
};

export type PersistedEventResult = { eventId: string; revisionId: string; version: number; outcome: "CREATED" | "LINKED" | "REVISED" | "ALREADY_PROCESSED" };

export type EventPersistencePlan = "CREATE" | "LINK" | "REVISE" | "ALREADY_PROCESSED";

export function planEventPersistence(input: {
  current: { eventId: string; revisionId: string; version: number } | null;
  revisionType: ExtractedEvent["revisionType"];
  documentAlreadyProcessed: boolean;
}): EventPersistencePlan {
  if (input.documentAlreadyProcessed) return "ALREADY_PROCESSED";
  if (!input.current) return "CREATE";
  return input.revisionType === "INITIAL" ? "LINK" : "REVISE";
}

export interface NewsIntelligenceRepository {
  getEntityCatalog(): Promise<EntityCandidate[]>;
  persistIntelligence(input: { document: IntelligenceDocument; event: ExtractedEvent; matches: EntityMatch[] }): Promise<PersistedEventResult>;
  recordFailure(input: { sourceId: string; externalId: string; stage: string; message: string; attempts: number }): Promise<void>;
}

export function documentTextSegments(document: Pick<IntelligenceDocument, "title" | "summary" | "content">): TextSegment[] {
  const segments: TextSegment[] = [{ field: "title", text: document.title }];
  if (document.summary) segments.push({ field: "summary", text: document.summary });
  if (document.content) segments.push({ field: "content", text: document.content });
  return segments;
}

export async function processNewsDocument(document: IntelligenceDocument, repository: NewsIntelligenceRepository) {
  let stage = "entity-resolution";
  try {
    const segments = documentTextSegments(document);
    const catalog = await repository.getEntityCatalog();
    const matches = resolveEntities(segments, catalog);
    stage = "event-extraction-classification";
    const event = extractEvent({ segments, matches, publishedAt: document.publishedAt });
    stage = "event-persistence";
    const persisted = await repository.persistIntelligence({ document, event, matches });
    return { event, matches, persisted };
  } catch (error) {
    await repository.recordFailure({
      sourceId: document.sourceId,
      externalId: document.id,
      stage,
      message: error instanceof Error ? error.message : "News intelligence processing failed",
      attempts: 1,
    });
    throw error;
  }
}
