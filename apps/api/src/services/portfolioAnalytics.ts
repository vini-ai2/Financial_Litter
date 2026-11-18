import { Prisma } from "@prisma/client";
import type { StockHolding, StockTradeForLedger } from "./stockLedger";
import { calculateStockHoldings } from "./stockLedger";

export const STOCK_PRICE_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type StockPriceRecord = {
  exchange: "NSE" | "BSE";
  symbol: string;
  price: Prisma.Decimal | string;
  source: string;
  asOf: Date;
};

export type PortfolioPosition = StockHolding & {
  price: string | null;
  priceSource: string | null;
  priceAsOf: string | null;
  priceStatus: "CURRENT" | "STALE" | "MISSING";
  marketValue: string | null;
  unrealizedPnl: string | null;
  currentAllocationPercent: string | null;
};

export type StockPortfolioAnalytics = {
  valuationStatus: "COMPLETE" | "INCOMPLETE" | "STALE";
  asOf: string;
  positions: PortfolioPosition[];
  realizedBySymbol: Array<{ exchange: "NSE" | "BSE"; symbol: string; realizedPnl: string }>;
  summary: {
    activePositionCount: number;
    pricedPositionCount: number;
    missingPriceCount: number;
    stalePriceCount: number;
    investedCostBasis: string;
    marketValueForPricedHoldings: string;
    totalMarketValue: string | null;
    realizedPnl: string;
    unrealizedPnlForPricedHoldings: string;
    totalUnrealizedPnl: string | null;
    topHoldingAllocationPercent: string | null;
    topFiveAllocationPercent: string | null;
    concentrationScope: "PRICED_HOLDINGS";
  };
  largestHoldings: PortfolioPosition[];
};

const keyOf = (exchange: string, symbol: string) => `${exchange}:${symbol}`;
const decimal = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);

function priceStatus(price: StockPriceRecord | undefined, now: Date): "CURRENT" | "STALE" | "MISSING" {
  if (!price) return "MISSING";
  const age = now.getTime() - price.asOf.getTime();
  return age < 0 || age > STOCK_PRICE_STALE_AFTER_MS ? "STALE" : "CURRENT";
}

/** FIFO-derived cost and realized P&L joined only to explicitly entered prices. */
export function calculateStockPortfolioAnalytics(
  trades: StockTradeForLedger[],
  prices: StockPriceRecord[],
  now: Date = new Date(),
): StockPortfolioAnalytics {
  const ledger = calculateStockHoldings(trades, true);
  const priceByKey = new Map(prices.map((price) => [keyOf(price.exchange, price.symbol), price]));
  const realizedBySymbol = ledger
    .filter((holding) => !decimal(holding.realizedPnl).isZero())
    .map(({ exchange, symbol, realizedPnl }) => ({ exchange, symbol, realizedPnl }));
  const activeLedger = ledger.filter((holding) => holding.quantity > 0);
  const missingPriceCount = activeLedger.filter((holding) => priceStatus(priceByKey.get(keyOf(holding.exchange, holding.symbol)), now) === "MISSING").length;
  const stalePriceCount = activeLedger.filter((holding) => priceStatus(priceByKey.get(keyOf(holding.exchange, holding.symbol)), now) === "STALE").length;
  const pricedPositionCount = activeLedger.length - missingPriceCount;
  const valuationStatus = missingPriceCount > 0 ? "INCOMPLETE" : stalePriceCount > 0 ? "STALE" : "COMPLETE";

  const exactValues = activeLedger.map((holding) => {
    const price = priceByKey.get(keyOf(holding.exchange, holding.symbol));
    const status = priceStatus(price, now);
    const exactMarketValue = price ? decimal(price.price).mul(holding.quantity) : null;
    const exactUnrealized = exactMarketValue ? exactMarketValue.minus(holding.costBasis) : null;
    return { holding, price, status, exactMarketValue, exactUnrealized };
  });

  const knownMarketValue = exactValues.reduce((sum, value) => value.exactMarketValue ? sum.plus(value.exactMarketValue) : sum, new Prisma.Decimal(0));
  const investedCostBasis = activeLedger.reduce((sum, holding) => sum.plus(holding.costBasis), new Prisma.Decimal(0));
  const realizedPnl = ledger.reduce((sum, holding) => sum.plus(holding.realizedPnl), new Prisma.Decimal(0));
  const knownUnrealized = exactValues.reduce((sum, value) => value.exactUnrealized ? sum.plus(value.exactUnrealized) : sum, new Prisma.Decimal(0));

  const positions: PortfolioPosition[] = exactValues.map(({ holding, price, status, exactMarketValue, exactUnrealized }) => ({
    ...holding,
    price: price?.price ? decimal(price.price).toFixed(6) : null,
    priceSource: price?.source ?? null,
    priceAsOf: price?.asOf.toISOString() ?? null,
    priceStatus: status,
    marketValue: exactMarketValue?.toFixed(2) ?? null,
    unrealizedPnl: exactUnrealized?.toFixed(2) ?? null,
    currentAllocationPercent: exactMarketValue && knownMarketValue.gt(0)
      ? exactMarketValue.div(knownMarketValue).mul(100).toFixed(2)
      : null,
  })).sort((a, b) => {
    if (a.marketValue === null) return b.marketValue === null ? a.symbol.localeCompare(b.symbol) : 1;
    if (b.marketValue === null) return -1;
    return decimal(b.marketValue).comparedTo(a.marketValue);
  });

  const pricedSorted = positions.filter((position) => position.marketValue !== null);
  const topHoldingAllocationPercent = pricedSorted[0]?.currentAllocationPercent ?? null;
  const topFiveAllocationPercent = pricedSorted.length
    ? pricedSorted.slice(0, 5).reduce((sum, position) => sum.plus(position.currentAllocationPercent ?? 0), new Prisma.Decimal(0)).toFixed(2)
    : null;

  return {
    valuationStatus,
    asOf: now.toISOString(),
    positions,
    realizedBySymbol,
    largestHoldings: positions.slice(0, 5),
    summary: {
      activePositionCount: activeLedger.length,
      pricedPositionCount,
      missingPriceCount,
      stalePriceCount,
      investedCostBasis: investedCostBasis.toFixed(2),
      marketValueForPricedHoldings: knownMarketValue.toFixed(2),
      totalMarketValue: valuationStatus === "COMPLETE" ? knownMarketValue.toFixed(2) : null,
      realizedPnl: realizedPnl.toFixed(2),
      unrealizedPnlForPricedHoldings: knownUnrealized.toFixed(2),
      totalUnrealizedPnl: valuationStatus === "COMPLETE" ? knownUnrealized.toFixed(2) : null,
      topHoldingAllocationPercent,
      topFiveAllocationPercent,
      concentrationScope: "PRICED_HOLDINGS",
    },
  };
}

export type TargetAllocation = { exchange: "NSE" | "BSE"; symbol: string; targetPercent: string };
export type RebalanceLine = {
  exchange: "NSE" | "BSE";
  symbol: string;
  currentAllocationPercent: string;
  targetAllocationPercent: string;
  deviationPercentagePoints: string;
  estimatedTradeAmount: string;
  action: "BUY" | "SELL" | "HOLD";
};

/** Build an indicative allocation comparison only when each active position has a current price. */
export function calculateRebalancePreview(
  portfolio: StockPortfolioAnalytics,
  targets: TargetAllocation[],
): { totalMarketValue: string; lines: RebalanceLine[] } {
  if (portfolio.valuationStatus !== "COMPLETE" || portfolio.summary.totalMarketValue === null) {
    throw new Error("CURRENT_COMPLETE_VALUATION_REQUIRED");
  }
  if (!portfolio.positions.length || targets.length !== portfolio.positions.length) throw new Error("TARGETS_MUST_COVER_ALL_ACTIVE_POSITIONS");

  const targetByKey = new Map<string, Prisma.Decimal>();
  let targetTotal = new Prisma.Decimal(0);
  for (const target of targets) {
    const key = keyOf(target.exchange, target.symbol);
    if (targetByKey.has(key)) throw new Error("DUPLICATE_TARGET_POSITION");
    const value = decimal(target.targetPercent);
    if (value.isNegative() || value.gt(100)) throw new Error("TARGET_PERCENT_OUT_OF_RANGE");
    targetTotal = targetTotal.plus(value);
    targetByKey.set(key, value);
  }
  if (!targetTotal.equals(100)) throw new Error("TARGET_PERCENTAGES_MUST_TOTAL_100");

  const totalMarketValue = decimal(portfolio.summary.totalMarketValue);
  const lines = portfolio.positions.map((position) => {
    const key = keyOf(position.exchange, position.symbol);
    const target = targetByKey.get(key);
    if (!target || position.marketValue === null || position.currentAllocationPercent === null) throw new Error("TARGETS_MUST_COVER_ALL_ACTIVE_POSITIONS");
    const marketValue = decimal(position.marketValue);
    const targetValue = totalMarketValue.mul(target).div(100);
    const difference = targetValue.minus(marketValue);
    return {
      exchange: position.exchange,
      symbol: position.symbol,
      currentAllocationPercent: position.currentAllocationPercent,
      targetAllocationPercent: target.toFixed(2),
      deviationPercentagePoints: decimal(position.currentAllocationPercent).minus(target).toFixed(2),
      estimatedTradeAmount: difference.abs().toFixed(2),
      action: difference.isZero() ? "HOLD" as const : difference.isPositive() ? "BUY" as const : "SELL" as const,
    };
  });
  return { totalMarketValue: totalMarketValue.toFixed(2), lines };
}
