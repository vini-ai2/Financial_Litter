ALTER TABLE "NewsPreference"
  ADD COLUMN "companies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "industries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TYPE "NewsWatchKind" AS ENUM ('COMPANY', 'INDUSTRY', 'TOPIC');

CREATE TABLE "NewsSavedEvent" (
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsSavedEvent_pkey" PRIMARY KEY ("userId", "eventId"),
  CONSTRAINT "NewsSavedEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NewsSavedEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NewsEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "NewsSavedEvent_userId_savedAt_idx" ON "NewsSavedEvent"("userId", "savedAt");

CREATE TABLE "NewsWatch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "NewsWatchKind" NOT NULL,
  "key" VARCHAR(240) NOT NULL,
  "entityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsWatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NewsWatch_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "NewsEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NewsWatch_entity_or_topic_check" CHECK (("kind" = 'TOPIC' AND "entityId" IS NULL) OR ("kind" IN ('COMPANY', 'INDUSTRY') AND "entityId" IS NOT NULL))
);
CREATE UNIQUE INDEX "NewsWatch_userId_key_key" ON "NewsWatch"("userId", "key");
CREATE INDEX "NewsWatch_userId_createdAt_idx" ON "NewsWatch"("userId", "createdAt");
CREATE INDEX "NewsWatch_entityId_idx" ON "NewsWatch"("entityId");

CREATE TABLE "NewsReadHistory" (
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "viewCount" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "NewsReadHistory_pkey" PRIMARY KEY ("userId", "eventId"),
  CONSTRAINT "NewsReadHistory_viewCount_check" CHECK ("viewCount" > 0),
  CONSTRAINT "NewsReadHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NewsReadHistory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NewsEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "NewsReadHistory_userId_lastViewedAt_idx" ON "NewsReadHistory"("userId", "lastViewedAt");

INSERT INTO "NewsSource" ("id", "key", "name", "organization", "jurisdiction", "category", "accessMethod", "officialUrl", "enabled", "retrievalConfig", "updatedAt")
VALUES (
  'pib-press-releases', 'pib-press-releases', 'Press Information Bureau releases', 'Press Information Bureau, Government of India', 'IN', 'GOVERNMENT', 'RSS',
  'https://www.pib.gov.in/', TRUE,
  '{"feedUrl":"https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1","retainSummary":true,"licenseUrl":"https://www.pib.gov.in/content/102_2_Copyright-Policy.aspx?lang=1&reg=30","attribution":"Press Information Bureau, Government of India","thirdPartyMaterialExcluded":true}'::jsonb,
  CURRENT_TIMESTAMP
) ON CONFLICT ("key") DO NOTHING;
