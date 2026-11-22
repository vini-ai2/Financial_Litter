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

export async function listNewsEvents(filters: NewsFilters, userId: string, mode: "all" | "personalized" | "saved" | "watched" = "all") {
  const where = buildNewsEventWhere(filters);
  if (mode === "saved") where.savedBy = { some: { userId } };
  if (mode === "watched") {
    const watches = await prisma.newsWatch.findMany({ where: { userId }, select: { kind: true, key: true, entityId: true } });
    const interests: any[] = [];
    for (const watch of watches) {
      if (watch.entityId) interests.push({ entities: { some: { entityId: watch.entityId } } });
      else interests.push({ OR: [{ title: { contains: watch.key.slice(6), mode: "insensitive" } }, { summary: { contains: watch.key.slice(6), mode: "insensitive" } }] });
    }
    if (!interests.length) where.id = "__no_watchlist_matches__";
    else where.currentRevision = { ...(where.currentRevision as object), AND: [
      ...((where.currentRevision as any)?.AND ? (Array.isArray((where.currentRevision as any).AND) ? (where.currentRevision as any).AND : [(where.currentRevision as any).AND]) : []), { OR: interests },
    ] } as any;
  }
  if (mode === "personalized") {
    const prefs = await prisma.newsPreference.findUnique({ where: { userId } });
    const interests: any[] = [];
    if (prefs?.categories.length) interests.push({ eventType: { in: prefs.categories } });
    if (prefs?.regions.length) interests.push({ OR: [
      { entities: { some: { entity: { jurisdiction: { in: prefs.regions } } } } },
      { documents: { some: { document: { source: { jurisdiction: { in: prefs.regions } } } } } },
    ] });
    if (prefs?.companies.length) interests.push({ entities: { some: { entityId: { in: prefs.companies } } } });
    if (prefs?.industries.length) interests.push({ entities: { some: { entityId: { in: prefs.industries } } } });
    for (const topic of prefs?.topics ?? []) interests.push({ OR: [
      { title: { contains: topic, mode: "insensitive" } }, { summary: { contains: topic, mode: "insensitive" } },
    ] });
    if (interests.length) where.currentRevision = { ...(where.currentRevision as object), AND: [
      ...((where.currentRevision as any)?.AND ? (Array.isArray((where.currentRevision as any).AND) ? (where.currentRevision as any).AND : [(where.currentRevision as any).AND]) : []), { OR: interests },
    ] } as any;
    else where.id = "__no_personalization_interests__";
  }
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
    items: events.map((event) => ({ ...eventListItem(event), interestMatch: mode === "personalized" ? "MATCHED" : null })),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export async function getNewsEvent(id: string, userId: string) {
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
  await prisma.newsReadHistory.upsert({
    where: { userId_eventId: { userId, eventId: id } },
    create: { userId, eventId: id },
    update: { lastViewedAt: new Date(), viewCount: { increment: 1 } },
  });
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
    isSaved: Boolean(await prisma.newsSavedEvent.findUnique({ where: { userId_eventId: { userId, eventId: id } }, select: { eventId: true } })),
    explanation: buildEventContextualExplanation(current.eventType, current.title, current.summary, current.entities.map(({ entity }: any) => entity.canonicalName), current.evidence.map((evidence: any) => evidence.id)),
    sourceReliability: { status: "UNASSESSED", note: "Sources are attributed; no independent reliability score is assigned." },
  };
}

export function buildEventContextualExplanation(type: NewsEventType, title: string, summary: string | null, entities: string[], evidenceIds: string[]) {
  const why: Record<NewsEventType, string> = {
    COMPANY_DEVELOPMENT: "Company disclosures can change what stakeholders know about operations or governance. This item alone does not establish future performance.",
    EARNINGS: "Results describe a reported period and can help readers understand revenue, costs and profitability. They do not predict later results.",
    REGULATORY_ACTION: "Regulatory notices can change obligations or clarify rules. The source and any later correction or appeal should be read in context.",
    MARKET_ECONOMIC: "Economic and market updates can affect borrowing, saving and business costs. The effect depends on the underlying details and timing.",
    CORPORATE_ACTION: "Corporate actions can change ownership, distributions or the number of securities. Check the effective dates and official terms.",
    RISK: "Risk disclosures describe possible exposures, not confirmed outcomes. The cited filing is the source of record for its scope.",
  };
  const consumer: Record<NewsEventType, string> = {
    COMPANY_DEVELOPMENT: "The source does not establish a change to consumer prices or services; check for a separate customer notice if you use this company.",
    EARNINGS: "Reported results alone do not establish a change to product prices, availability or service for customers.",
    REGULATORY_ACTION: "Any consumer effect depends on which institutions and products are in scope and when the direction takes effect; check the official notice.",
    MARKET_ECONOMIC: "If this concerns policy rates or inflation, it can help readers compare borrowing and saving offers; it does not establish a change to any provider's terms.",
    CORPORATE_ACTION: "The direct effect is defined by the official terms and eligibility dates; consumer effects beyond those terms are not established here.",
    RISK: "A disclosed exposure is not proof of a loss or service disruption; check later notices for affected customers or confirmed outcomes.",
  };
  const student: Record<NewsEventType, string> = {
    COMPANY_DEVELOPMENT: "For students and early-career readers, separate a reported company action from any assumption about future jobs or prices.",
    EARNINGS: "Use the stated reporting period to understand the company's results; it does not predict hiring, wages or later performance.",
    REGULATORY_ACTION: "Check whether a bank, product or transaction you use is covered and note the effective date before drawing a personal conclusion.",
    MARKET_ECONOMIC: "This can provide context for how policy and economic data relate to borrowing or saving; use actual lender terms for personal decisions.",
    CORPORATE_ACTION: "This is directly relevant if you hold an affected security; read its official eligibility and timing details.",
    RISK: "Distinguish a stated exposure from a confirmed outcome, and look for subsequent notices or corrections.",
  };
  const named = entities.length ? entities.join(", ") : "No company or industry was confidently resolved in the source.";
  return {
    whatHappened: summary || title,
    whyItMatters: why[type],
    involved: named,
    consumerContext: consumer[type],
    studentContext: student[type],
    monitorNext: "Review linked source documents and later revisions for clarifications, effective dates or subsequent filings.",
    uncertainty: "The consumer and student context is interpretation of the cited event category; it is not a sourced prediction or personalised recommendation.",
    interpretation: true,
    evidenceIds,
  };
}

export async function getNewsPreferences(userId: string) {
  const preference = await prisma.newsPreference.findUnique({ where: { userId } });
  return { categories: preference?.categories ?? [], regions: preference?.regions ?? [], companies: preference?.companies ?? [], industries: preference?.industries ?? [], topics: preference?.topics ?? [] };
}

export async function updateNewsPreferences(userId: string, input: { categories: string[]; regions: string[]; companies: string[]; industries: string[]; topics: string[] }) {
  const companyIds = [...new Set(input.companies)];
  const industryIds = [...new Set(input.industries)];
  if (companyIds.length !== input.companies.length || industryIds.length !== input.industries.length) throw Object.assign(new Error("Selected interests must be unique"), { statusCode: 400 });
  const checks: any[] = [];
  if (companyIds.length) checks.push({ id: { in: companyIds }, type: { in: ["COMPANY", "SECURITY"] } });
  if (industryIds.length) checks.push({ id: { in: industryIds }, type: "SECTOR" });
  const validEntities = checks.length ? await prisma.newsEntity.findMany({ where: { OR: checks }, select: { id: true } }) : [];
  if (validEntities.length !== companyIds.length + industryIds.length) throw Object.assign(new Error("One or more selected interests are invalid"), { statusCode: 400 });
  const preference = await prisma.newsPreference.upsert({
    where: { userId },
    create: { userId, categories: input.categories as any, regions: input.regions, companies: input.companies, industries: input.industries, topics: input.topics },
    update: { categories: input.categories as any, regions: input.regions, companies: input.companies, industries: input.industries, topics: input.topics },
  });
  return { categories: preference.categories, regions: preference.regions, companies: preference.companies, industries: preference.industries, topics: preference.topics };
}

export async function getPulsePreferences(userId: string) {
  const p = await getNewsPreferences(userId);
  const entities = await prisma.newsEntity.findMany({ where: { type: { in: ["COMPANY", "SECURITY", "SECTOR"] } }, select: { id: true, canonicalName: true, type: true, jurisdiction: true }, orderBy: { canonicalName: "asc" } });
  const topics = await prisma.newsEntity.findMany({ where: { type: "SECTOR" }, select: { id: true, canonicalName: true, jurisdiction: true }, orderBy: { canonicalName: "asc" } });
  return { ...p, entities, topicOptions: topics.map((topic) => topic.canonicalName) };
}

export async function saveNewsEvent(userId: string, eventId: string) {
  const event = await prisma.newsEvent.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return false;
  await prisma.newsSavedEvent.upsert({ where: { userId_eventId: { userId, eventId } }, create: { userId, eventId }, update: {} });
  return true;
}
export async function unsaveNewsEvent(userId: string, eventId: string) {
  await prisma.newsSavedEvent.deleteMany({ where: { userId, eventId } });
}
export async function addNewsWatch(userId: string, input: { kind: "COMPANY" | "INDUSTRY" | "TOPIC"; value: string }) {
  const isTopic = input.kind === "TOPIC";
  const normalized = input.value.trim();
  if (!isTopic) {
    const entity = await prisma.newsEntity.findUnique({ where: { id: normalized } });
    if (!entity || (input.kind === "COMPANY" ? !["COMPANY", "SECURITY"].includes(entity.type) : entity.type !== "SECTOR")) return null;
    const key = `${input.kind}:${entity.id}`;
    return prisma.newsWatch.upsert({ where: { userId_key: { userId, key } }, create: { userId, kind: input.kind, key, entityId: entity.id }, update: {} });
  }
  if (normalized.length < 2) return null;
  const key = `TOPIC:${normalized.toLowerCase()}`;
  return prisma.newsWatch.upsert({ where: { userId_key: { userId, key } }, create: { userId, kind: "TOPIC", key }, update: {} });
}
export async function listNewsWatches(userId: string) {
  return prisma.newsWatch.findMany({ where: { userId }, include: { entity: true }, orderBy: { createdAt: "desc" } });
}
export async function removeNewsWatch(userId: string, id: string) {
  await prisma.newsWatch.deleteMany({ where: { userId, id } });
}
export async function listNewsHistory(userId: string) {
  return prisma.newsReadHistory.findMany({ where: { userId }, include: { event: { include: eventListInclude } }, orderBy: { lastViewedAt: "desc" }, take: 50 });
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

export function summarizeNewsSourceHealth(
  source: { name: string; organization: string; officialUrl: string; accessMethod: string; lastRetrievedAt: Date | null; documentCount: number; evidenceCount: number },
  failure: { occurredAt: Date; stage: string; attempts: number; message: string } | undefined,
  now = Date.now(),
  processingFailure?: { occurredAt: Date; stage: string; attempts: number; message: string },
) {
  const failedAfterLastSuccess = Boolean(failure && (!source.lastRetrievedAt || failure.occurredAt > source.lastRetrievedAt));
  const stale = source.lastRetrievedAt && now - source.lastRetrievedAt.getTime() > 24 * 60 * 60 * 1000;
  const status = source.accessMethod !== "RSS" ? "UNSUPPORTED" as const : failedAfterLastSuccess ? "ERROR" as const : !source.lastRetrievedAt ? "PENDING" as const : stale ? "STALE" as const : "CURRENT" as const;
  return {
    name: source.name,
    organization: source.organization,
    url: source.officialUrl,
    status,
    lastRetrievedAt: source.lastRetrievedAt,
    lastSuccessfulFetchAt: source.lastRetrievedAt,
    documentCount: source.documentCount,
    evidenceCount: source.evidenceCount,
    latestFailureAt: failure?.occurredAt ?? null,
    latestFailureStage: failure?.stage ?? null,
    latestFailureMessage: failedAfterLastSuccess ? failure?.message ?? null : null,
    attempts: failedAfterLastSuccess ? failure?.attempts ?? null : null,
    latestProcessingFailureAt: processingFailure?.occurredAt ?? null,
    latestProcessingFailureStage: processingFailure?.stage.replace(/^intelligence:/, "") ?? null,
    latestProcessingFailureMessage: processingFailure?.message ?? null,
  };
}

export async function getNewsSourceStatus() {
  const sources = await prisma.newsSource.findMany({ where: { enabled: true }, select: { id: true, name: true, organization: true, officialUrl: true, accessMethod: true, lastRetrievedAt: true, _count: { select: { documents: true, eventEvidence: true } } }, orderBy: [{ jurisdiction: "asc" }, { name: "asc" }] });
  const failures = sources.length ? await prisma.newsIngestionFailure.findMany({ where: { sourceId: { in: sources.map((source) => source.id) } }, select: { sourceId: true, externalId: true, occurredAt: true, stage: true, attempts: true, message: true }, orderBy: { occurredAt: "desc" } }) : [];
  const latestFailure = new Map<string, typeof failures[number]>();
  const latestProcessingFailure = new Map<string, typeof failures[number]>();
  const unresolvedDocuments = await prisma.newsDocument.findMany({ where: { sourceId: { in: sources.map((source) => source.id) }, eventLinks: { none: {} } }, select: { id: true, sourceId: true } });
  const unresolvedBySource = new Map<string, Set<string>>();
  for (const document of unresolvedDocuments) {
    const ids = unresolvedBySource.get(document.sourceId) ?? new Set<string>();
    ids.add(document.id);
    unresolvedBySource.set(document.sourceId, ids);
  }
  for (const failure of failures) {
    if (failure.stage.startsWith("intelligence:")) {
      if (failure.externalId && unresolvedBySource.get(failure.sourceId)?.has(failure.externalId) && !latestProcessingFailure.has(failure.sourceId)) latestProcessingFailure.set(failure.sourceId, failure);
    } else if (!latestFailure.has(failure.sourceId)) latestFailure.set(failure.sourceId, failure);
  }
  return sources.map((source) => {
    return summarizeNewsSourceHealth({ ...source, documentCount: source._count.documents, evidenceCount: source._count.eventEvidence }, latestFailure.get(source.id), Date.now(), latestProcessingFailure.get(source.id));
  });
}
