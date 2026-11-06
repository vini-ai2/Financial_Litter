CREATE TYPE "NewsSourceCategory" AS ENUM ('EXCHANGE', 'REGULATOR', 'CENTRAL_BANK', 'GOVERNMENT', 'OTHER');
CREATE TYPE "NewsAccessMethod" AS ENUM ('RSS', 'API', 'LICENSED_FEED', 'MANUAL');

CREATE TABLE "NewsSource" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "organization" VARCHAR(160) NOT NULL,
    "jurisdiction" VARCHAR(80) NOT NULL,
    "category" "NewsSourceCategory" NOT NULL,
    "accessMethod" "NewsAccessMethod" NOT NULL,
    "officialUrl" VARCHAR(2048) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "retrievalConfig" JSONB NOT NULL DEFAULT '{}',
    "lastRetrievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NewsSource_key_key" ON "NewsSource"("key");
CREATE INDEX "NewsSource_enabled_category_idx" ON "NewsSource"("enabled", "category");

CREATE TABLE "NewsDocument" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" VARCHAR(512) NOT NULL,
    "title" VARCHAR(1000) NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "canonicalUrl" VARCHAR(2048) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" CHAR(64) NOT NULL,
    "sourceMetadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "NewsDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NewsDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NewsDocument_sourceId_externalId_key" ON "NewsDocument"("sourceId", "externalId");
CREATE INDEX "NewsDocument_sourceId_publishedAt_idx" ON "NewsDocument"("sourceId", "publishedAt");
CREATE UNIQUE INDEX "NewsDocument_sourceId_contentHash_key" ON "NewsDocument"("sourceId", "contentHash");

CREATE TABLE "NewsIngestionFailure" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" VARCHAR(512),
    "stage" VARCHAR(40) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsIngestionFailure_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NewsIngestionFailure_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "NewsIngestionFailure_sourceId_occurredAt_idx" ON "NewsIngestionFailure"("sourceId", "occurredAt");

-- The official RSS endpoint is public, but NSE's published copyright terms do
-- not clearly grant FinLitter permission to retain/re-publish feed summaries.
-- Keep disabled until permitted usage is confirmed.
INSERT INTO "NewsSource" (
    "id", "key", "name", "organization", "jurisdiction", "category",
    "accessMethod", "officialUrl", "enabled", "retrievalConfig", "updatedAt"
) VALUES (
    'news_source_nse_corporate_announcements',
    'nse-corporate-announcements',
    'Corporate announcements',
    'National Stock Exchange of India Limited',
    'IN',
    'EXCHANGE',
    'RSS',
    'https://nseindia.com/companies-listing/corporate-filings-announcements',
    false,
    '{"feedUrl":"https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml","disabledReason":"Awaiting confirmation that persistent ingestion and display of RSS summaries is permitted."}',
    CURRENT_TIMESTAMP
);
