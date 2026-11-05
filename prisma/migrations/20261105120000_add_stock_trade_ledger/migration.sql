CREATE TYPE "StockExchange" AS ENUM ('NSE', 'BSE');
CREATE TYPE "StockTradeSide" AS ENUM ('BUY', 'SELL');

CREATE TABLE "StockTrade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" "StockExchange" NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "companyName" VARCHAR(120),
    "side" "StockTradeSide" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "executionPrice" DECIMAL(20,6) NOT NULL,
    "fees" DECIMAL(20,2) NOT NULL,
    "tradeDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversesTransactionId" TEXT,
    "correctionReason" VARCHAR(500),
    CONSTRAINT "StockTrade_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockTrade_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "StockTrade_executionPrice_positive" CHECK ("executionPrice" > 0),
    CONSTRAINT "StockTrade_fees_nonnegative" CHECK ("fees" >= 0),
    CONSTRAINT "StockTrade_symbol_normalized" CHECK ("symbol" <> '' AND "symbol" = upper(trim("symbol"))),
    CONSTRAINT "StockTrade_correction_link_reason" CHECK (
      ("reversesTransactionId" IS NULL AND "correctionReason" IS NULL) OR
      ("reversesTransactionId" IS NOT NULL AND "correctionReason" IS NOT NULL AND length(trim("correctionReason")) > 0)
    )
);

CREATE UNIQUE INDEX "StockTrade_reversesTransactionId_key" ON "StockTrade"("reversesTransactionId");
CREATE INDEX "StockTrade_userId_exchange_symbol_tradeDate_createdAt_idx" ON "StockTrade"("userId", "exchange", "symbol", "tradeDate", "createdAt");
CREATE INDEX "StockTrade_userId_createdAt_idx" ON "StockTrade"("userId", "createdAt");

ALTER TABLE "StockTrade" ADD CONSTRAINT "StockTrade_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTrade" ADD CONSTRAINT "StockTrade_reversesTransactionId_fkey"
  FOREIGN KEY ("reversesTransactionId") REFERENCES "StockTrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
