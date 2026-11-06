import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import type { NewsDocumentRepository } from "./types";

export const prismaNewsRepository: NewsDocumentRepository = {
  async findDocument(sourceId, externalId) {
    return prisma.newsDocument.findUnique({ where: { sourceId_externalId: { sourceId, externalId } }, select: { id: true, contentHash: true } });
  },
  async findByHash(sourceId, contentHash) {
    return prisma.newsDocument.findFirst({ where: { sourceId, contentHash }, select: { id: true, contentHash: true } });
  },
  async createDocument(input) {
    await prisma.newsDocument.create({ data: { ...input, sourceMetadata: input.sourceMetadata as Prisma.InputJsonValue } });
  },
  async recordFailure(input) {
    await prisma.newsIngestionFailure.create({ data: input });
    console.error(`[news ingestion] ${input.stage} failed for source ${input.sourceId}${input.externalId ? ` document ${input.externalId}` : ""} after ${input.attempts} attempt(s): ${input.message}`);
  },
  async markRetrieved(sourceId, at) {
    await prisma.newsSource.update({ where: { id: sourceId }, data: { lastRetrievedAt: at } });
  },
};
