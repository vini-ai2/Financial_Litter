ALTER TABLE "User" ADD COLUMN "creditScore" INTEGER;

CREATE TABLE "MonthlySnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalAssets" DECIMAL(65,30) NOT NULL,
    "totalLiabilities" DECIMAL(65,30) NOT NULL,
    "netWorth" DECIMAL(65,30) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlySnapshot_userId_year_month_key" ON "MonthlySnapshot"("userId", "year", "month");
CREATE INDEX "MonthlySnapshot_userId_capturedAt_idx" ON "MonthlySnapshot"("userId", "capturedAt");
ALTER TABLE "MonthlySnapshot" ADD CONSTRAINT "MonthlySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
