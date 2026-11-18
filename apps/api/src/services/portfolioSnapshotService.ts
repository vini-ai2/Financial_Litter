import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { calculateStockHoldings, type StockTradeForLedger } from "./stockLedger";
import { calculateStockPortfolioAnalytics, type StockPriceRecord } from "./portfolioAnalytics";

const scale = 12;
const asDecimal = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);
const fixed = (value: Prisma.Decimal) => value.toFixed(scale);
const captureBucketFor = (date: Date) => new Date(Math.floor(date.getTime() / 1000) * 1000);

function snapshotShape(snapshot: any) {
  return {
    ...snapshot,
    capturedAt: snapshot.capturedAt.toISOString(),
    investedCostBasis: snapshot.investedCostBasis.toFixed(scale),
    marketValueForPricedHoldings: snapshot.marketValueForPricedHoldings.toFixed(scale),
    totalMarketValue: snapshot.totalMarketValue?.toFixed(scale) ?? null,
    realizedPnl: snapshot.realizedPnl.toFixed(scale),
    unrealizedPnlForPricedHoldings: snapshot.unrealizedPnlForPricedHoldings.toFixed(scale),
    totalUnrealizedPnl: snapshot.totalUnrealizedPnl?.toFixed(scale) ?? null,
    holdings: snapshot.holdings?.map((holding: any) => ({
      ...holding,
      costBasis: holding.costBasis.toFixed(scale),
      averageCost: holding.averageCost.toFixed(scale),
      price: holding.price?.toFixed(6) ?? null,
      priceAsOf: holding.priceAsOf?.toISOString() ?? null,
      marketValue: holding.marketValue?.toFixed(scale) ?? null,
      realizedPnl: holding.realizedPnl.toFixed(scale),
      unrealizedPnl: holding.unrealizedPnl?.toFixed(scale) ?? null,
    })),
  };
}

async function readSnapshot(tx: Prisma.TransactionClient, userId: string, captureBucket: Date) {
  return tx.portfolioSnapshot.findUnique({
    where: { userId_captureBucket: { userId, captureBucket } },
    include: { holdings: { orderBy: [{ exchange: "asc" }, { symbol: "asc" }] } },
  });
}

/** Captures one immutable valuation for the authenticated user at a UTC second boundary. */
export async function capturePortfolioSnapshot(userId: string, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_CAPTURE_TIMESTAMP");
  const capturedAt = now;
  const captureBucket = captureBucketFor(now);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await readSnapshot(tx, userId, captureBucket);
      if (existing) return { snapshot: snapshotShape(existing), duplicate: true };

      const [tradeRows, priceRows] = await Promise.all([
        tx.stockTrade.findMany({ where: { userId }, orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
        tx.stockPrice.findMany({ where: { userId }, orderBy: [{ asOf: "desc" }, { updatedAt: "desc" }] }),
      ]);
      const trades = tradeRows as StockTradeForLedger[];
      const prices = priceRows as StockPriceRecord[];
      const analytics = calculateStockPortfolioAnalytics(trades, prices, capturedAt);
      const allLedger = calculateStockHoldings(trades, true, scale);
      const activeByKey = new Map(analytics.positions.map((position) => [`${position.exchange}:${position.symbol}`, position]));

      const exactHoldings = allLedger.filter((holding) => holding.quantity > 0).map((holding) => {
        const analyticsHolding = activeByKey.get(`${holding.exchange}:${holding.symbol}`);
        if (!analyticsHolding) throw new Error("SNAPSHOT_HOLDING_MISMATCH");
        const marketValue = analyticsHolding.price === null
          ? null
          : asDecimal(analyticsHolding.price).mul(holding.quantity);
        const costBasis = asDecimal(holding.costBasis);
        return {
          exchange: holding.exchange,
          symbol: holding.symbol,
          quantity: holding.quantity,
          costBasis,
          averageCost: asDecimal(holding.averageCostPerShare),
          price: analyticsHolding.price === null ? null : asDecimal(analyticsHolding.price),
          priceSource: analyticsHolding.priceSource,
          priceAsOf: analyticsHolding.priceAsOf ? new Date(analyticsHolding.priceAsOf) : null,
          priceStatus: analyticsHolding.priceStatus,
          marketValue,
          realizedPnl: asDecimal(holding.realizedPnl),
          unrealizedPnl: marketValue === null ? null : marketValue.minus(costBasis),
        };
      });

      const invested = exactHoldings.reduce((sum, item) => sum.plus(item.costBasis), new Prisma.Decimal(0));
      const knownMarket = exactHoldings.reduce((sum, item) => item.marketValue ? sum.plus(item.marketValue) : sum, new Prisma.Decimal(0));
      const knownUnrealized = exactHoldings.reduce((sum, item) => item.unrealizedPnl ? sum.plus(item.unrealizedPnl) : sum, new Prisma.Decimal(0));
      const realized = allLedger.reduce((sum, item) => sum.plus(item.realizedPnl), new Prisma.Decimal(0));
      const complete = analytics.valuationStatus === "COMPLETE";
      const row = await tx.portfolioSnapshot.create({
        data: {
          userId,
          capturedAt,
          captureBucket,
          valuationStatus: analytics.valuationStatus,
          activePositionCount: analytics.summary.activePositionCount,
          pricedPositionCount: analytics.summary.pricedPositionCount,
          missingPriceCount: analytics.summary.missingPriceCount,
          stalePriceCount: analytics.summary.stalePriceCount,
          investedCostBasis: fixed(invested),
          marketValueForPricedHoldings: fixed(knownMarket),
          totalMarketValue: complete ? fixed(knownMarket) : null,
          realizedPnl: fixed(realized),
          unrealizedPnlForPricedHoldings: fixed(knownUnrealized),
          totalUnrealizedPnl: complete ? fixed(knownUnrealized) : null,
          holdings: { create: exactHoldings },
        },
        include: { holdings: { orderBy: [{ exchange: "asc" }, { symbol: "asc" }] } },
      });
      return { snapshot: snapshotShape(row), duplicate: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      const existing = await readSnapshot(prisma, userId, captureBucket);
      if (existing) return { snapshot: snapshotShape(existing), duplicate: true };
    }
    throw error;
  }
}

export async function listPortfolioSnapshots(userId: string, from?: Date, to?: Date) {
  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: { userId, capturedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } },
    orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
    take: 500,
  });
  return snapshots.reverse().map((snapshot) => snapshotShape({ ...snapshot, holdings: undefined }));
}

export async function getPortfolioSnapshot(userId: string, id: string) {
  const snapshot = await prisma.portfolioSnapshot.findFirst({
    where: { id, userId },
    include: { holdings: { orderBy: [{ exchange: "asc" }, { symbol: "asc" }] } },
  });
  return snapshot ? snapshotShape(snapshot) : null;
}

export async function getHistoricalPortfolioValuation(userId: string, from?: Date, to?: Date) {
  const snapshots = await listPortfolioSnapshots(userId, from, to);
  return snapshots.map((snapshot) => ({
    id: snapshot.id,
    capturedAt: snapshot.capturedAt,
    valuationStatus: snapshot.valuationStatus,
    activePositionCount: snapshot.activePositionCount,
    missingPriceCount: snapshot.missingPriceCount,
    stalePriceCount: snapshot.stalePriceCount,
    investedCostBasis: snapshot.investedCostBasis,
    marketValueForPricedHoldings: snapshot.marketValueForPricedHoldings,
    totalMarketValue: snapshot.totalMarketValue,
    realizedPnl: snapshot.realizedPnl,
    unrealizedPnlForPricedHoldings: snapshot.unrealizedPnlForPricedHoldings,
    totalUnrealizedPnl: snapshot.totalUnrealizedPnl,
  }));
}

export async function comparePortfolioSnapshots(userId: string, fromId: string, toId: string) {
  const [from, to] = await Promise.all([
    prisma.portfolioSnapshot.findFirst({ where: { id: fromId, userId } }),
    prisma.portfolioSnapshot.findFirst({ where: { id: toId, userId } }),
  ]);
  if (!from || !to) return null;
  if (from.capturedAt > to.capturedAt) throw new Error("SNAPSHOT_RANGE_REVERSED");
  const knownMarketValueChange = to.marketValueForPricedHoldings.minus(from.marketValueForPricedHoldings);
  const realizedPnlChange = to.realizedPnl.minus(from.realizedPnl);
  const knownUnrealizedPnlChange = to.unrealizedPnlForPricedHoldings.minus(from.unrealizedPnlForPricedHoldings);
  const totalMarketValueChange = from.totalMarketValue && to.totalMarketValue
    ? to.totalMarketValue.minus(from.totalMarketValue)
    : null;
  return {
    from: { id: from.id, capturedAt: from.capturedAt.toISOString(), valuationStatus: from.valuationStatus },
    to: { id: to.id, capturedAt: to.capturedAt.toISOString(), valuationStatus: to.valuationStatus },
    knownMarketValueChange: fixed(knownMarketValueChange),
    totalMarketValueChange: totalMarketValueChange === null ? null : fixed(totalMarketValueChange),
    realizedPnlChange: fixed(realizedPnlChange),
    knownUnrealizedPnlChange: fixed(knownUnrealizedPnlChange),
  };
}
