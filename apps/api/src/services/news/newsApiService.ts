import prisma from "../../lib/prisma";
import { NewsEventType } from "@prisma/client";
import type { NewsFilters } from "./newsQuery";
import { buildNewsEventWhere, paginationWindow } from "./newsQuery";

const eventListInclude = {
  currentRevision: {
    include: {
      entities: { include: { entity: true } },
      documents: { include: { document: { include: { source: true } } }, orderBy: { linkedAt: "asc" as const } },
    },
  },
};

function sourceStatus(documents: Array<{ document: { source: { officialUrl: string } } }>) {
  return documents.length ? "SOURCE_LINKED" as const : "NO_SOURCE" as const;
}

function eventListItem(event: any) {
  const revision = event.currentRevision;
  const documents = revision?.documents ?? [];
  return {
    id: event.id,
    headline: revision?.title ?? "",
    summary: revision?.summary ?? "",
    category: revision?.eventType ?? null,
    classificationConfidence: revision?.classificationConfidence ?? null,
    materiality: revision?.materiality ?? "UNKNOWN",
    eventDate: revision?.eventDate ?? null,
    revisionVersion: revision?.version ?? null,
    revisionType: revision?.revisionType ?? null,
    entities: revision?.entities.map(({ entity }: any) => ({ id: entity.id, name: entity.canonicalName, type: entity.type, jurisdiction: entity.jurisdiction })) ?? [],
    sourceCount: documents.length,
    verificationStatus: sourceStatus(documents),
    verificationNote: documents.length ? "Source document linked; not independently fact-checked." : "No supporting source document linked.",
  };
}

export async function listNewsEvents(filters: NewsFilters) {
  const where = buildNewsEventWhere(filters);
  const [events, total] = await Promise.all([
    prisma.newsEvent.findMany({
      where,
      include: eventListInclude,
      orderBy: [{ createdAt: "desc" }],
      ...paginationWindow(filters),
    }),
    prisma.newsEvent.count({ where }),
  ]);
  return {
    items: events.map(eventListItem),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export async function getNewsEvent(id: string) {
  const eventDetailInclude = {
    ...eventListInclude.currentRevision.include,
    evidence: { include: { source: true, document: true }, orderBy: [{ sourceId: "asc" as const }, { startOffset: "asc" as const }] },
  };
  const event = await prisma.newsEvent.findUnique({
    where: { id },
    include: {
      currentRevision: { include: eventDetailInclude },
      revisions: {
        include: {
          entities: { include: { entity: true } },
          evidence: { include: { source: true, document: true }, orderBy: [{ sourceId: "asc" }, { startOffset: "asc" }] },
          documents: { include: { document: { include: { source: true } } }, orderBy: { linkedAt: "asc" } },
        },
        orderBy: { version: "asc" },
      },
    },
  });
  if (!event?.currentRevision) return null;
  const current = event.currentRevision;
  const documents = current.documents.map(({ document }: any) => ({
    id: document.id,
    title: document.title,
    url: document.canonicalUrl,
    sourceId: document.sourceId,
    sourceName: document.source.name,
    organization: document.source.organization,
    officialUrl: document.source.officialUrl,
    sourceJurisdiction: document.source.jurisdiction,
    publishedAt: document.publishedAt,
    retrievedAt: document.retrievedAt,
    contentHash: document.contentHash,
  }));
  return {
    id: event.id,
    headline: current.title,
    whatHappened: current.summary,
    category: current.eventType,
    classificationConfidence: current.classificationConfidence,
    materiality: current.materiality,
    eventDate: current.eventDate,
    revisionVersion: current.version,
    revisionType: current.revisionType,
    verificationStatus: sourceStatus(current.documents),
    verificationNote: current.documents.length ? "Source document linked; not independently fact-checked." : "No supporting source document linked.",
    entities: current.entities.map(({ entity }: any) => ({ id: entity.id, name: entity.canonicalName, type: entity.type, jurisdiction: entity.jurisdiction })),
    facts: current.facts,
    supportingSources: documents,
    revisions: event.revisions.map((revision: any) => ({
      version: revision.version,
      type: revision.revisionType,
      headline: revision.title,
      summary: revision.summary,
      eventDate: revision.eventDate,
      recordedAt: revision.createdAt,
      classificationConfidence: revision.classificationConfidence,
      materiality: revision.materiality,
      sources: revision.documents.map(({ document }: any) => ({
        id: document.id,
        title: document.title,
        url: document.canonicalUrl,
        sourceName: document.source.name,
        officialUrl: document.source.officialUrl,
        publishedAt: document.publishedAt,
        retrievedAt: document.retrievedAt,
      })),
      evidence: revision.evidence.map((evidence: any) => ({
        documentId: evidence.documentId,
        sourceId: evidence.sourceId,
        field: evidence.field,
        startOffset: evidence.startOffset,
        endOffset: evidence.endOffset,
        quote: evidence.quote,
        sourceName: evidence.source.name,
      })),
    })),
    supportingEvidence: current.evidence.map((evidence: any) => ({
      documentId: evidence.documentId,
      sourceId: evidence.sourceId,
      field: evidence.field,
      startOffset: evidence.startOffset,
      endOffset: evidence.endOffset,
      quote: evidence.quote,
      sourceName: evidence.source.name,
    })),
  };
}

export async function getNewsPreferences(userId: string) {
  const preference = await prisma.newsPreference.findUnique({ where: { userId } });
  return { categories: preference?.categories ?? [], regions: preference?.regions ?? [] };
}

export async function updateNewsPreferences(userId: string, input: { categories: string[]; regions: string[] }) {
  const preference = await prisma.newsPreference.upsert({
    where: { userId },
    create: { userId, categories: input.categories as any, regions: input.regions },
    update: { categories: input.categories as any, regions: input.regions },
  });
  return { categories: preference.categories, regions: preference.regions };
}

export async function getNewsFilterOptions() {
  const [sourceRegions, entityRegions] = await Promise.all([
    prisma.newsSource.findMany({ where: { enabled: true }, select: { jurisdiction: true }, distinct: ["jurisdiction"] }),
    prisma.newsEntity.findMany({ where: { jurisdiction: { not: null } }, select: { jurisdiction: true }, distinct: ["jurisdiction"] }),
  ]);
  return {
    categories: Object.values(NewsEventType),
    regions: [...new Set([...sourceRegions, ...entityRegions].map(({ jurisdiction }) => jurisdiction).filter((value): value is string => Boolean(value)))].sort(),
  };
}
