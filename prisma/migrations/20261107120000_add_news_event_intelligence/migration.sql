CREATE TYPE "NewsEntityType" AS ENUM ('COMPANY', 'SECURITY', 'REGULATOR', 'SECTOR');
CREATE TYPE "NewsEntityMatchStatus" AS ENUM ('RESOLVED', 'AMBIGUOUS', 'UNRESOLVED');
CREATE TYPE "NewsEventType" AS ENUM ('COMPANY_DEVELOPMENT', 'EARNINGS', 'REGULATORY_ACTION', 'MARKET_ECONOMIC', 'CORPORATE_ACTION', 'RISK');
CREATE TYPE "NewsMateriality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN');
CREATE TYPE "NewsRevisionType" AS ENUM ('INITIAL', 'AMENDMENT', 'CORRECTION', 'RETRACTION', 'DEVELOPMENT');

CREATE TABLE "NewsEntity" (
  "id" TEXT NOT NULL,
  "canonicalName" VARCHAR(240) NOT NULL,
  "normalizedName" VARCHAR(240) NOT NULL,
  "type" "NewsEntityType" NOT NULL,
  "jurisdiction" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NewsEntity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NewsEntity_normalizedName_type_idx" ON "NewsEntity"("normalizedName", "type");

CREATE TABLE "NewsEntityAlias" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "alias" VARCHAR(240) NOT NULL,
  "normalizedAlias" VARCHAR(240) NOT NULL,
  CONSTRAINT "NewsEntityAlias_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsEntityAlias_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "NewsEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "NewsEntityAlias_normalizedAlias_idx" ON "NewsEntityAlias"("normalizedAlias");
CREATE INDEX "NewsEntityAlias_entityId_idx" ON "NewsEntityAlias"("entityId");

CREATE TABLE "NewsEntityIdentifier" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "scheme" VARCHAR(80) NOT NULL,
  "value" VARCHAR(200) NOT NULL,
  "normalizedValue" VARCHAR(200) NOT NULL,
  CONSTRAINT "NewsEntityIdentifier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsEntityIdentifier_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "NewsEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NewsEntityIdentifier_scheme_normalizedValue_key" ON "NewsEntityIdentifier"("scheme", "normalizedValue");
CREATE INDEX "NewsEntityIdentifier_entityId_idx" ON "NewsEntityIdentifier"("entityId");

CREATE TABLE "NewsEntityMention" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "entityId" TEXT,
  "matchedAlias" VARCHAR(240) NOT NULL,
  "candidateEntityIds" JSONB NOT NULL DEFAULT '[]',
  "field" VARCHAR(16) NOT NULL,
  "startOffset" INTEGER NOT NULL,
  "endOffset" INTEGER NOT NULL,
  "status" "NewsEntityMatchStatus" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "NewsEntityMention_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsEntityMention_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "NewsDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NewsEntityMention_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "NewsEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "NewsEntityMention_documentId_startOffset_idx" ON "NewsEntityMention"("documentId", "startOffset");
CREATE INDEX "NewsEntityMention_entityId_idx" ON "NewsEntityMention"("entityId");
CREATE UNIQUE INDEX "NewsEntityMention_documentId_field_startOffset_endOffset_matchedAlias_key" ON "NewsEntityMention"("documentId", "field", "startOffset", "endOffset", "matchedAlias");

CREATE TABLE "NewsEvent" (
  "id" TEXT NOT NULL,
  "dedupeKey" VARCHAR(64),
  "currentRevisionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NewsEvent_dedupeKey_key" ON "NewsEvent"("dedupeKey");
CREATE UNIQUE INDEX "NewsEvent_currentRevisionId_key" ON "NewsEvent"("currentRevisionId");

CREATE TABLE "NewsEventRevision" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "eventType" "NewsEventType" NOT NULL,
  "classificationConfidence" DOUBLE PRECISION NOT NULL,
  "materiality" "NewsMateriality" NOT NULL,
  "revisionType" "NewsRevisionType" NOT NULL,
  "title" VARCHAR(1000) NOT NULL,
  "summary" TEXT,
  "eventDate" TIMESTAMP(3),
  "facts" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsEventRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsEventRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NewsEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NewsEventRevision_eventId_version_key" ON "NewsEventRevision"("eventId", "version");
CREATE INDEX "NewsEventRevision_eventId_createdAt_idx" ON "NewsEventRevision"("eventId", "createdAt");
ALTER TABLE "NewsEvent" ADD CONSTRAINT "NewsEvent_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "NewsEventRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "NewsEventEvidence" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "field" VARCHAR(16) NOT NULL,
  "startOffset" INTEGER NOT NULL,
  "endOffset" INTEGER NOT NULL,
  "quote" TEXT NOT NULL,
  "factType" VARCHAR(80) NOT NULL,
  CONSTRAINT "NewsEventEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsEventEvidence_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "NewsEventRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NewsEventEvidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "NewsDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NewsEventEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "NewsEventEvidence_revisionId_idx" ON "NewsEventEvidence"("revisionId");
CREATE INDEX "NewsEventEvidence_documentId_idx" ON "NewsEventEvidence"("documentId");
CREATE INDEX "NewsEventEvidence_sourceId_idx" ON "NewsEventEvidence"("sourceId");

CREATE TABLE "NewsEventDocument" (
  "eventId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsEventDocument_pkey" PRIMARY KEY ("eventId", "documentId"),
  CONSTRAINT "NewsEventDocument_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NewsEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NewsEventDocument_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "NewsEventRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NewsEventDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "NewsDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "NewsEventDocument_revisionId_idx" ON "NewsEventDocument"("revisionId");
CREATE INDEX "NewsEventDocument_documentId_idx" ON "NewsEventDocument"("documentId");

CREATE TABLE "NewsEventEntity" (
  "eventId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  CONSTRAINT "NewsEventEntity_pkey" PRIMARY KEY ("revisionId", "entityId"),
  CONSTRAINT "NewsEventEntity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NewsEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NewsEventEntity_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "NewsEventRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NewsEventEntity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "NewsEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "NewsEventEntity_eventId_idx" ON "NewsEventEntity"("eventId");
CREATE INDEX "NewsEventEntity_entityId_idx" ON "NewsEventEntity"("entityId");
