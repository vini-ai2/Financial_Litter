import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import stockRoutes from "../routes/stockTrades";
import { capturePortfolioSnapshot, comparePortfolioSnapshots, getPortfolioSnapshot, getHistoricalPortfolioValuation, listPortfolioSnapshots } from "../services/portfolioSnapshotService";
import type { StockTradeForLedger } from "../services/stockLedger";
import type { StockPriceRecord } from "../services/portfolioAnalytics";
import { getPortfolioSnapshotController, listPortfolioSnapshotsController } from "../controllers/stockTradeController";

const baseTime = new Date("2026-11-18T12:00:00.123Z");
const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const makeTrade = (overrides: Partial<StockTradeForLedger> = {}): StockTradeForLedger => ({
  id: "trade-1", exchange: "NSE", symbol: "INFY", companyName: "Infosys", side: "BUY", quantity: 3,
  executionPrice: new Prisma.Decimal("100.123456"), fees: new Prisma.Decimal("0.01"), tradeDate: new Date("2026-11-01T00:00:00Z"),
  createdAt: new Date("2026-11-01T10:00:00Z"), reversesTransactionId: null, correctionReason: null, ...overrides,
});
const makePrice = (asOf = baseTime, value = "120.000001"): StockPriceRecord => ({
  exchange: "NSE", symbol: "INFY", price: new Prisma.Decimal(value), source: "USER_ENTERED", asOf,
});

function withPrismaMock(options: { trades?: StockTradeForLedger[]; prices?: StockPriceRecord[] } = {}, work: () => Promise<void>) {
  const restorers: Array<() => void> = [];
  const set = (target: object, key: string, value: unknown) => {
    const original = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, value });
    restorers.push(() => original ? Object.defineProperty(target, key, original) : Reflect.deleteProperty(target, key));
  };
  const db = prisma as any;
  const snapshots = new Map<string, any>();
  let created = 0;
  const withHoldings = (snapshot: any) => snapshot && ({ ...snapshot, holdings: snapshot.holdings ?? [] });
  const findByCaptured = (userId: string, captureBucket: Date) => snapshots.get(`${userId}:${captureBucket.toISOString()}`) ?? null;
  set(db.stockTrade, "findMany", async () => options.trades ?? []);
  set(db.stockPrice, "findMany", async () => options.prices ?? []);
  set(db.portfolioSnapshot, "findUnique", async ({ where }: any) => withHoldings(findByCaptured(where.userId_captureBucket.userId, where.userId_captureBucket.captureBucket)));
  set(db.portfolioSnapshot, "create", async ({ data }: any) => {
    created += 1;
    const capturedAt = data.capturedAt;
    const row = {
      ...data,
      id: `snapshot-${created}`,
      capturedAt,
      investedCostBasis: new Prisma.Decimal(data.investedCostBasis),
      marketValueForPricedHoldings: new Prisma.Decimal(data.marketValueForPricedHoldings),
      totalMarketValue: data.totalMarketValue === null ? null : new Prisma.Decimal(data.totalMarketValue),
      realizedPnl: new Prisma.Decimal(data.realizedPnl),
      unrealizedPnlForPricedHoldings: new Prisma.Decimal(data.unrealizedPnlForPricedHoldings),
      totalUnrealizedPnl: data.totalUnrealizedPnl === null ? null : new Prisma.Decimal(data.totalUnrealizedPnl),
      holdings: data.holdings.create.map((holding: any) => ({
        ...holding,
        costBasis: new Prisma.Decimal(holding.costBasis), averageCost: new Prisma.Decimal(holding.averageCost),
        price: holding.price === null ? null : new Prisma.Decimal(holding.price),
        marketValue: holding.marketValue === null ? null : new Prisma.Decimal(holding.marketValue),
        realizedPnl: new Prisma.Decimal(holding.realizedPnl),
        unrealizedPnl: holding.unrealizedPnl === null ? null : new Prisma.Decimal(holding.unrealizedPnl),
      })),
    };
    snapshots.set(`${data.userId}:${data.captureBucket.toISOString()}`, row);
    return withHoldings(row);
  });
  set(db.portfolioSnapshot, "findMany", async ({ where }: any) => [...snapshots.values()].filter((row) => row.userId === where.userId
    && (!where.capturedAt?.gte || row.capturedAt >= where.capturedAt.gte)
    && (!where.capturedAt?.lte || row.capturedAt <= where.capturedAt.lte)).sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()));
  set(db.portfolioSnapshot, "findFirst", async ({ where }: any) => {
    const row = [...snapshots.values()].find((item) => item.id === where.id && item.userId === where.userId);
    return withHoldings(row ?? null);
  });
  set(db, "$transaction", async (callback: (tx: any) => Promise<unknown>) => callback(db));
  return work().finally(() => restorers.reverse().forEach((restore) => restore()));
}

test("snapshot capture stores exact values immutably and suppresses duplicate captures in the same second", async () => {
  await withPrismaMock({ trades: [makeTrade()], prices: [makePrice()] }, async () => {
    const first = await capturePortfolioSnapshot(userA, baseTime);
    const duplicate = await capturePortfolioSnapshot(userA, new Date("2026-11-18T12:00:00.900Z"));
    assert.equal(first.duplicate, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(first.snapshot.id, duplicate.snapshot.id);
    assert.equal(first.snapshot.capturedAt, "2026-11-18T12:00:00.123Z");
    assert.equal(first.snapshot.holdings[0].costBasis, "300.380368000000");
    assert.equal(first.snapshot.holdings[0].marketValue, "360.000003000000");
    assert.equal(first.snapshot.holdings[0].unrealizedPnl, "59.619635000000");
    assert.equal(first.snapshot.valuationStatus, "COMPLETE");
    assert.equal(first.snapshot.totalMarketValue, "360.000003000000");
  });
});

test("snapshots retain missing and stale valuation states without filling missing market values", async () => {
  await withPrismaMock({ trades: [makeTrade()] }, async () => {
    const missing = await capturePortfolioSnapshot(userA, baseTime);
    assert.equal(missing.snapshot.valuationStatus, "INCOMPLETE");
    assert.equal(missing.snapshot.totalMarketValue, null);
    assert.equal(missing.snapshot.holdings[0].priceStatus, "MISSING");
    assert.equal(missing.snapshot.holdings[0].marketValue, null);
    assert.equal(missing.snapshot.holdings[0].unrealizedPnl, null);
  });
  const staleAt = new Date(baseTime.getTime() - 8 * 24 * 60 * 60 * 1000);
  await withPrismaMock({ trades: [makeTrade()], prices: [makePrice(staleAt)] }, async () => {
    const stale = await capturePortfolioSnapshot(userA, baseTime);
    assert.equal(stale.snapshot.valuationStatus, "STALE");
    assert.equal(stale.snapshot.stalePriceCount, 1);
    assert.equal(stale.snapshot.totalMarketValue, null);
    assert.equal(stale.snapshot.holdings[0].priceStatus, "STALE");
  });
});

test("snapshot history, details, comparisons and chart rows are isolated to the owner", async () => {
  const testData: { trades?: StockTradeForLedger[]; prices?: StockPriceRecord[] } = { trades: [makeTrade()], prices: [makePrice()] };
  await withPrismaMock(testData, async () => {
    const first = await capturePortfolioSnapshot(userA, baseTime);
    testData.prices = [makePrice(baseTime, "999.999999")];
    const second = await capturePortfolioSnapshot(userA, new Date(baseTime.getTime() + 2000));
    const history = await getHistoricalPortfolioValuation(userA);
    assert.deepEqual(history.map((row) => row.id), [first.snapshot.id, second.snapshot.id]);
    assert.equal((await getPortfolioSnapshot(userA, first.snapshot.id))?.holdings[0].symbol, "INFY");
    assert.equal((await getPortfolioSnapshot(userA, first.snapshot.id))?.holdings[0].price, "120.000001");
    assert.equal(second.snapshot.holdings[0].price, "999.999999");
    assert.equal(await getPortfolioSnapshot(userB, first.snapshot.id), null);
    assert.deepEqual(await listPortfolioSnapshots(userB), []);
    const comparison = await comparePortfolioSnapshots(userA, first.snapshot.id, second.snapshot.id);
    assert.equal(comparison?.knownMarketValueChange, "2639.999994000000");
    assert.equal(await comparePortfolioSnapshots(userB, first.snapshot.id, second.snapshot.id), null);
  });
});

test("snapshot endpoints validate identifiers and ranges and require authenticated router middleware", async () => {
  const response = () => {
    const result: { statusCode?: number; body?: unknown } = {};
    return { result, status(code: number) { result.statusCode = code; return this; }, json(body: unknown) { result.body = body; return this; } };
  };
  const badId = response();
  await getPortfolioSnapshotController({ params: { id: "not-a-uuid" }, userId: userA } as any, badId as any);
  assert.equal(badId.result.statusCode, 400);
  const badRange = response();
  await listPortfolioSnapshotsController({ query: { from: "2026-11-19T00:00:00Z", to: "2026-11-18T00:00:00Z" }, userId: userA } as any, badRange as any);
  assert.equal(badRange.result.statusCode, 400);
  const middleware = (stockRoutes as any).stack;
  const authIndex = middleware.findIndex((layer: any) => layer.name === "authenticate");
  const firstRouteIndex = middleware.findIndex((layer: any) => layer.route);
  assert.ok(authIndex >= 0 && firstRouteIndex > authIndex);
});

test("snapshot comparisons reject reversed time ranges", async () => {
  await withPrismaMock({ trades: [makeTrade()], prices: [makePrice()] }, async () => {
    const first = await capturePortfolioSnapshot(userA, baseTime);
    const second = await capturePortfolioSnapshot(userA, new Date(baseTime.getTime() + 2000));
    await assert.rejects(comparePortfolioSnapshots(userA, second.snapshot.id, first.snapshot.id), /SNAPSHOT_RANGE_REVERSED/);
  });
});
