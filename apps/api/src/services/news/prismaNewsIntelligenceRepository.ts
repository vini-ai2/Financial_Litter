import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import { planEventPersistence, type NewsIntelligenceRepository } from "./newsIntelligenceService";

export const prismaNewsIntelligenceRepository: NewsIntelligenceRepository = {
  async getEntityCatalog() {
    const entities = await prisma.newsEntity.findMany({ include: { aliases: true, identifiers: true } });
    return entities.map((entity) => ({
      id: entity.id,
      canonicalName: entity.canonicalName,
      type: entity.type,
      aliases: entity.aliases.map((alias) => alias.alias),
      identifiers: entity.identifiers.map((identifier) => identifier.value),
    }));
  },

  async persistIntelligence({ document, event, matches }) {
    return prisma.$transaction(async (tx) => {
      const priorLink = await tx.newsEventDocument.findFirst({
        where: { documentId: document.id },
        include: { event: true, revision: true },
      });
      const existing = event.dedupeKey
        ? await tx.newsEvent.findUnique({ where: { dedupeKey: event.dedupeKey }, include: { currentRevision: true } })
        : null;
      const current = existing?.currentRevision ? { eventId: existing.id, revisionId: existing.currentRevision.id, version: existing.currentRevision.version } : null;
      const plan = planEventPersistence({ current, revisionType: event.revisionType, documentAlreadyProcessed: Boolean(priorLink) });
      if (plan === "ALREADY_PROCESSED" && priorLink) {
        return { eventId: priorLink.eventId, revisionId: priorLink.revisionId, version: priorLink.revision.version, outcome: "ALREADY_PROCESSED" as const };
      }

      await tx.newsEntityMention.createMany({
        data: matches.map((match) => ({
          documentId: document.id,
          entityId: match.entityId,
          matchedAlias: match.mention,
          candidateEntityIds: match.candidates as Prisma.InputJsonValue,
          field: match.field,
          startOffset: match.startOffset,
          endOffset: match.endOffset,
          status: match.status,
          confidence: match.confidence,
        })),
        skipDuplicates: true,
      });

      let eventId: string;
      let revisionId: string;
      let version: number;
      let outcome: "CREATED" | "LINKED" | "REVISED";
      if (plan === "CREATE") {
        const created = await tx.newsEvent.create({ data: { dedupeKey: event.dedupeKey } });
        eventId = created.id;
        version = 1;
        outcome = "CREATED";
        const revision = await tx.newsEventRevision.create({
          data: {
            eventId,
            version,
            eventType: event.classification.eventType,
            classificationConfidence: event.classification.classificationConfidence,
            materiality: event.classification.materiality,
            revisionType: event.revisionType,
            title: event.title,
            summary: event.summary,
            eventDate: event.publishedAt,
            facts: event.facts as unknown as Prisma.InputJsonValue,
          },
        });
        revisionId = revision.id;
        await tx.newsEvent.update({ where: { id: eventId }, data: { currentRevisionId: revisionId } });
      } else if (plan === "LINK" && existing?.currentRevision) {
        eventId = existing.id;
        revisionId = existing.currentRevision.id;
        version = existing.currentRevision.version;
        outcome = "LINKED";
      } else {
        if (!existing) throw new Error("Event revision target was not found");
        eventId = existing.id;
        version = (existing.currentRevision?.version ?? 0) + 1;
        outcome = "REVISED";
        const revision = await tx.newsEventRevision.create({
          data: {
            eventId,
            version,
            eventType: event.classification.eventType,
            classificationConfidence: event.classification.classificationConfidence,
            materiality: event.classification.materiality,
            revisionType: event.revisionType,
            title: event.title,
            summary: event.summary,
            eventDate: event.publishedAt,
            facts: event.facts as unknown as Prisma.InputJsonValue,
          },
        });
        revisionId = revision.id;
        await tx.newsEvent.update({ where: { id: eventId }, data: { currentRevisionId: revisionId } });
      }

      await tx.newsEventDocument.create({ data: { eventId, revisionId, documentId: document.id } });
      await tx.newsEventEvidence.createMany({
        data: event.evidence.map((evidence) => ({
          revisionId,
          documentId: document.id,
          sourceId: document.sourceId,
          field: evidence.field,
          startOffset: evidence.startOffset,
          endOffset: evidence.endOffset,
          quote: evidence.quote,
          factType: evidence.factType,
        })),
      });
      const entityIds = [...new Set(matches.filter((match) => match.status === "RESOLVED" && match.entityId).map((match) => match.entityId!))];
      if (entityIds.length) {
        await tx.newsEventEntity.createMany({
          data: entityIds.map((entityId) => ({ eventId, revisionId, entityId })),
          skipDuplicates: true,
        });
      }
      return { eventId, revisionId, version, outcome };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 30_000 });
  },

  async recordFailure(input) {
    await prisma.newsIngestionFailure.create({ data: { ...input, stage: `intelligence:${input.stage}` } });
    console.error(`[news intelligence] ${input.stage} failed for source ${input.sourceId}, document ${input.externalId}: ${input.message}`);
  },
};
