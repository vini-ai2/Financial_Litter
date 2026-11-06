import { z } from "zod";
import { NewsEventType, Prisma } from "@prisma/client";

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Date must use YYYY-MM-DD");

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const newsFilterSchema = z.object({
  page: paginationSchema.shape.page,
  pageSize: paginationSchema.shape.pageSize,
  category: z.nativeEnum(NewsEventType).optional(),
  region: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/).transform((value) => value.toUpperCase()).optional(),
  company: z.string().trim().min(1).max(160).optional(),
  from: dateValue.optional(),
  to: dateValue.optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, { message: "Start date must be on or before end date", path: ["from"] });

export type NewsFilters = z.infer<typeof newsFilterSchema>;

export function buildNewsEventWhere(filters: NewsFilters): Prisma.NewsEventWhereInput {
  const revision: Prisma.NewsEventRevisionWhereInput = {};
  if (filters.category) revision.eventType = filters.category;
  if (filters.from || filters.to) {
    revision.eventDate = {
      ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
    };
  }
  if (filters.company) revision.entities = {
    some: {
      entity: {
        type: { in: ["COMPANY", "SECURITY"] },
        OR: [
          { id: filters.company },
          { canonicalName: { contains: filters.company, mode: "insensitive" } },
          { aliases: { some: { alias: { contains: filters.company, mode: "insensitive" } } } },
          { identifiers: { some: { value: { contains: filters.company, mode: "insensitive" } } } },
        ],
      },
    },
  };
  if (filters.region) {
    revision.OR = [
      { entities: { some: { entity: { jurisdiction: filters.region } } } },
      { documents: { some: { document: { source: { jurisdiction: filters.region } } } } },
    ];
  }
  return { currentRevision: revision };
}

export function paginationWindow(filters: Pick<NewsFilters, "page" | "pageSize">) {
  return { skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize };
}
