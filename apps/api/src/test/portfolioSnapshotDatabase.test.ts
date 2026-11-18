import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import prisma from "../lib/prisma";
import { capturePortfolioSnapshot, getPortfolioSnapshot, getHistoricalPortfolioValuation } from "../services/portfolioSnapshotService";

const disposableUrl = process.env.PORTFOLIO_SNAPSHOT_TEST_DATABASE_URL;
const enabled = Boolean(disposableUrl && disposableUrl === process.env.DATABASE_URL);

test("PostgreSQL snapshot integration: persistence, isolation, duplicate capture and historical immutability", { skip: !enabled }, async () => {
  const url = new URL(disposableUrl!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/finlitter_test") {
    throw new Error("Refusing snapshot database tests unless DATABASE_URL targets the disposable localhost finlitter_test database");
  }
  const userId = randomUUID();
  let tradeId: string | undefined;
  try {
    await prisma.user.create({ data: {
      id: userId,
      email: `snapshot-${userId}@example.invalid`,
      passwordHash: "test-only-hash",
      firstName: "Snapshot",
      lastName: "Test",
      phone: "0000000000",
    } });
    const trade = await prisma.stockTrade.create({ data: {
      userId, exchange: "NSE", symbol: "INFY", companyName: "Infosys", side: "BUY", quantity: 3,
      executionPrice: "100.123456", fees: "0.01", tradeDate: new Date("2026-11-01T00:00:00Z"),
    } });
    tradeId = trade.id;
    const captureTime = new Date(Math.floor((Date.now() - 10_000) / 1000) * 1000 + 100);
    await prisma.stockPrice.create({ data: {
      userId, exchange: "NSE", symbol: "INFY", price: "120.000001", source: "USER_ENTERED", asOf: new Date(captureTime.getTime() - 1_000),
    } });

    const first = await capturePortfolioSnapshot(userId, captureTime);
    const repeated = await capturePortfolioSnapshot(userId, new Date(captureTime.getTime() + 500));
    assert.equal(first.duplicate, false);
    assert.equal(repeated.duplicate, true);
    assert.equal(first.snapshot.holdings[0].costBasis, "300.380368000000");
    assert.equal(first.snapshot.holdings[0].marketValue, "360.000003000000");

    await prisma.stockPrice.update({ where: { userId_exchange_symbol: { userId, exchange: "NSE", symbol: "INFY" } }, data: { price: "222.222222", asOf: new Date(captureTime.getTime() + 1_000) } });
    const second = await capturePortfolioSnapshot(userId, new Date(captureTime.getTime() + 2_000));
    const historical = await getPortfolioSnapshot(userId, first.snapshot.id);
    assert.equal(historical?.holdings[0].price, "120.000001");
    assert.equal(second.snapshot.holdings[0].price, "222.222222");
    assert.equal(await getPortfolioSnapshot(randomUUID(), first.snapshot.id), null);
    assert.equal((await getHistoricalPortfolioValuation(userId)).length, 2);
  } finally {
    if (tradeId) await prisma.stockTrade.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
});
