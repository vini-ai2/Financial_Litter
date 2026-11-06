import prisma from "../../lib/prisma";
import { Prisma } from "@prisma/client";
import type { NewsSource, NewsSourceCategory, NewsAccessMethod } from "./types";

export type UpsertNewsSourceInput = {
  key: string;
  name: string;
  organization: string;
  jurisdiction: string;
  category: NewsSourceCategory;
  accessMethod: NewsAccessMethod;
  officialUrl: string;
  enabled?: boolean;
  retrievalConfig?: Record<string, unknown>;
};

export async function upsertNewsSource(input: UpsertNewsSourceInput): Promise<NewsSource> {
  const retrievalConfig = input.retrievalConfig as Prisma.InputJsonValue | undefined;
  return prisma.newsSource.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      name: input.name,
      organization: input.organization,
      jurisdiction: input.jurisdiction,
      category: input.category,
      accessMethod: input.accessMethod,
      officialUrl: input.officialUrl,
      enabled: input.enabled ?? false,
      retrievalConfig: retrievalConfig ?? {},
    },
    update: {
      name: input.name,
      organization: input.organization,
      jurisdiction: input.jurisdiction,
      category: input.category,
      accessMethod: input.accessMethod,
      officialUrl: input.officialUrl,
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(retrievalConfig === undefined ? {} : { retrievalConfig }),
    },
  });
}

export async function getEnabledNewsSources(): Promise<NewsSource[]> {
  return prisma.newsSource.findMany({ where: { enabled: true }, orderBy: [{ jurisdiction: "asc" }, { name: "asc" }] });
}
