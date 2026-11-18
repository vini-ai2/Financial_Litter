CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "captureBucket" TIMESTAMP(3) NOT NULL,
    "valuationStatus" VARCHAR(16) NOT NULL,
    "activePositionCount" INTEGER NOT NULL,
    "pricedPositionCount" INTEGER NOT NULL,
    "missingPriceCount" INTEGER NOT NULL,
    "stalePriceCount" INTEGER NOT NULL,
    "investedCostBasis" DECIMAL(38,12) NOT NULL,
    "marketValueForPricedHoldings" DECIMAL(38,12) NOT NULL,
    "totalMarketValue" DECIMAL(38,12),
    "realizedPnl" DECIMAL(38,12) NOT NULL,
    "unrealizedPnlForPricedHoldings" DECIMAL(38,12) NOT NULL,
    "totalUnrealizedPnl" DECIMAL(38,12),
    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PortfolioSnapshot_status_valid" CHECK ("valuationStatus" IN ('COMPLETE', 'INCOMPLETE', 'STALE')),
    CONSTRAINT "PortfolioSnapshot_counts_nonnegative" CHECK (
      "activePositionCount" >= 0 AND "pricedPositionCount" >= 0 AND "missingPriceCount" >= 0 AND "stalePriceCount" >= 0
    ),
    CONSTRAINT "PortfolioSnapshot_counts_consistent" CHECK (
      "pricedPositionCount" + "missingPriceCount" = "activePositionCount" AND "stalePriceCount" <= "pricedPositionCount"
    ),
    CONSTRAINT "PortfolioSnapshot_totals_consistent" CHECK (
      ("valuationStatus" = 'COMPLETE' AND "totalMarketValue" IS NOT NULL AND "totalUnrealizedPnl" IS NOT NULL AND "missingPriceCount" = 0 AND "stalePriceCount" = 0)
      OR ("valuationStatus" <> 'COMPLETE' AND "totalMarketValue" IS NULL AND "totalUnrealizedPnl" IS NULL)
    )
);

CREATE UNIQUE INDEX "PortfolioSnapshot_userId_captureBucket_key" ON "PortfolioSnapshot"("userId", "captureBucket");
CREATE UNIQUE INDEX "PortfolioSnapshot_userId_id_key" ON "PortfolioSnapshot"("userId", "id");
CREATE INDEX "PortfolioSnapshot_userId_capturedAt_idx" ON "PortfolioSnapshot"("userId", "capturedAt");

CREATE TABLE "PortfolioSnapshotHolding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "exchange" "StockExchange" NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "costBasis" DECIMAL(38,12) NOT NULL,
    "averageCost" DECIMAL(38,12) NOT NULL,
    "price" DECIMAL(20,6),
    "priceSource" VARCHAR(40),
    "priceAsOf" TIMESTAMP(3),
    "priceStatus" VARCHAR(16) NOT NULL,
    "marketValue" DECIMAL(38,12),
    "realizedPnl" DECIMAL(38,12) NOT NULL,
    "unrealizedPnl" DECIMAL(38,12),
    CONSTRAINT "PortfolioSnapshotHolding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PortfolioSnapshotHolding_status_valid" CHECK ("priceStatus" IN ('CURRENT', 'STALE', 'MISSING')),
    CONSTRAINT "PortfolioSnapshotHolding_values_consistent" CHECK (
      ("priceStatus" = 'MISSING' AND "price" IS NULL AND "priceSource" IS NULL AND "priceAsOf" IS NULL AND "marketValue" IS NULL AND "unrealizedPnl" IS NULL)
      OR ("priceStatus" IN ('CURRENT', 'STALE') AND "price" IS NOT NULL AND "priceSource" IS NOT NULL AND "priceAsOf" IS NOT NULL AND "marketValue" IS NOT NULL AND "unrealizedPnl" IS NOT NULL)
    ),
    CONSTRAINT "PortfolioSnapshotHolding_symbol_normalized" CHECK ("symbol" <> '' AND "symbol" = upper(trim("symbol")))
);

CREATE UNIQUE INDEX "PortfolioSnapshotHolding_userId_snapshotId_exchange_symbol_key" ON "PortfolioSnapshotHolding"("userId", "snapshotId", "exchange", "symbol");
CREATE INDEX "PortfolioSnapshotHolding_userId_snapshotId_idx" ON "PortfolioSnapshotHolding"("userId", "snapshotId");

ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioSnapshotHolding" ADD CONSTRAINT "PortfolioSnapshotHolding_userId_snapshotId_fkey"
  FOREIGN KEY ("userId", "snapshotId") REFERENCES "PortfolioSnapshot"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
