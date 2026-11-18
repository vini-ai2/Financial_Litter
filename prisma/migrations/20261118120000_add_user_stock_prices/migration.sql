CREATE TABLE "StockPrice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" "StockExchange" NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "price" DECIMAL(20,6) NOT NULL,
    "source" VARCHAR(40) NOT NULL DEFAULT 'USER_ENTERED',
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockPrice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockPrice_price_positive" CHECK ("price" > 0),
    CONSTRAINT "StockPrice_symbol_normalized" CHECK ("symbol" <> '' AND "symbol" = upper(trim("symbol")))
);

CREATE UNIQUE INDEX "StockPrice_userId_exchange_symbol_key" ON "StockPrice"("userId", "exchange", "symbol");
CREATE INDEX "StockPrice_userId_asOf_idx" ON "StockPrice"("userId", "asOf");

ALTER TABLE "StockPrice" ADD CONSTRAINT "StockPrice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
