CREATE TABLE "NewsPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "categories" "NewsEventType"[] NOT NULL DEFAULT ARRAY[]::"NewsEventType"[],
  "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NewsPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NewsPreference_userId_key" ON "NewsPreference"("userId");
