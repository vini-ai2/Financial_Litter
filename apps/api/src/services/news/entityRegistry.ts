import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import { normalizeEntityLabel, type EntityKind } from "./entityResolution";

export type RegisterEntityInput = {
  canonicalName: string;
  type: EntityKind;
  jurisdiction?: string;
  aliases?: string[];
  identifiers?: Array<{ scheme: string; value: string }>;
};

export async function registerNewsEntity(input: RegisterEntityInput) {
  const canonicalName = input.canonicalName.trim();
  if (!canonicalName) throw new Error("Canonical entity name is required");
  const names = [...new Set([canonicalName, ...(input.aliases ?? []).map((alias) => alias.trim())].filter(Boolean))];
  const identifiers = (input.identifiers ?? []).map((identifier) => ({
    scheme: identifier.scheme.trim().toUpperCase(),
    value: identifier.value.trim(),
    normalizedValue: identifier.value.normalize("NFKC").trim().toUpperCase(),
  }));
  if (identifiers.some((identifier) => !identifier.scheme || !identifier.value || !identifier.normalizedValue)) throw new Error("Entity identifiers require a scheme and value");

  return prisma.$transaction(async (tx) => {
    const entity = await tx.newsEntity.create({
      data: {
        canonicalName,
        normalizedName: normalizeEntityLabel(canonicalName),
        type: input.type,
        jurisdiction: input.jurisdiction?.trim() || null,
        aliases: { create: names.map((alias) => ({ alias, normalizedAlias: normalizeEntityLabel(alias) })) },
        identifiers: { create: identifiers },
      },
      include: { aliases: true, identifiers: true },
    });
    return entity;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
