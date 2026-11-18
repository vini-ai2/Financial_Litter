import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { calculateRebalancePreview, calculateStockPortfolioAnalytics, type StockPriceRecord } from "../services/portfolioAnalytics";
import { getStockPortfolioAnalytics } from "../services/stockTradeService";
import type { StockTradeForLedger } from "../services/stockLedger";

const now = new Date("2026-11-18T12:00:00Z");
const trade = (id: string, side: "BUY" | "SELL", quantity: number, price: string, fees: string, day: number): StockTradeForLedger => ({
  id, exchange: "NSE", symbol: "INFY", companyName: "Infosys", side, quantity,
  executionPrice: new Prisma.Decimal(price), fees: new Prisma.Decimal(fees),
  tradeDate: new Date(Date.UTC(2026, 10, day)), createdAt: new Date(Date.UTC(2026, 10, day, 10)),
  reversesTransactionId: null, correctionReason: null,
});
const price = (symbol: string, value: string, asOf = now, exchange: "NSE" | "BSE" = "NSE"): StockPriceRecord => ({
  exchange, symbol, price: new Prisma.Decimal(value), source: "USER_ENTERED", asOf,
});

test("FIFO portfolio analytics values partial holdings and keeps realized and unrealized P&L separate", () => {
  const result = calculateStockPortfolioAnalytics([
    trade("buy", "BUY", 5, "100", "5", 1),
    trade("sell", "SELL", 3, "120", "2", 2),
  ], [price("INFY", "110.123456")], now);
  assert.equal(result.valuationStatus, "COMPLETE");
  assert.deepEqual(result.positions[0], {
    exchange: "NSE", symbol: "INFY", companyName: "Infosys", quantity: 2,
    costBasis: "202.00", averageCostPerShare: "101.000000", realizedPnl: "55.00",
    price: "110.123456", priceSource: "USER_ENTERED", priceAsOf: now.toISOString(), priceStatus: "CURRENT",
    marketValue: "220.25", unrealizedPnl: "18.25", currentAllocationPercent: "100.00",
  });
  assert.equal(result.summary.investedCostBasis, "202.00");
  assert.equal(result.summary.totalMarketValue, "220.25");
  assert.equal(result.summary.realizedPnl, "55.00");
  assert.equal(result.summary.totalUnrealizedPnl, "18.25");
});

test("a fully sold position remains in realized P&L without appearing as an active holding", () => {
  const result = calculateStockPortfolioAnalytics([
    trade("buy", "BUY", 5, "100", "5", 1),
    trade("sell-a", "SELL", 3, "120", "2", 2),
    trade("sell-b", "SELL", 2, "90", "1", 3),
  ], [], now);
  assert.equal(result.positions.length, 0);
  assert.deepEqual(result.realizedBySymbol, [{ exchange: "NSE", symbol: "INFY", realizedPnl: "32.00" }]);
  assert.equal(result.summary.realizedPnl, "32.00");
  assert.equal(result.summary.investedCostBasis, "0.00");
  assert.equal(result.summary.totalMarketValue, "0.00");
});

test("missing prices never fall back to cost basis and make total valuation incomplete", () => {
  const result = calculateStockPortfolioAnalytics([
    trade("buy", "BUY", 2, "100", "0", 1),
  ], [], now);
  assert.equal(result.valuationStatus, "INCOMPLETE");
  assert.equal(result.positions[0].priceStatus, "MISSING");
  assert.equal(result.positions[0].marketValue, null);
  assert.equal(result.positions[0].unrealizedPnl, null);
  assert.equal(result.summary.marketValueForPricedHoldings, "0.00");
  assert.equal(result.summary.totalMarketValue, null);
  assert.equal(result.summary.totalUnrealizedPnl, null);
});

test("stale manual prices remain identified and prevent complete valuation", () => {
  const old = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const result = calculateStockPortfolioAnalytics([trade("buy", "BUY", 1, "100", "0", 1)], [price("INFY", "120", old)], now);
  assert.equal(result.valuationStatus, "STALE");
  assert.equal(result.positions[0].priceStatus, "STALE");
  assert.equal(result.positions[0].marketValue, "120.00");
  assert.equal(result.summary.totalMarketValue, null);
  assert.equal(result.summary.unrealizedPnlForPricedHoldings, "20.00");
});

test("allocation, concentration and largest holdings use only known market values", () => {
  const trades = [
    { ...trade("a", "BUY", 3, "100", "0", 1), symbol: "AAA" },
    { ...trade("b", "BUY", 1, "100", "0", 1), symbol: "BBB" },
    { ...trade("c", "BUY", 1, "50", "0", 1), symbol: "CCC" },
  ];
  const result = calculateStockPortfolioAnalytics(trades, [price("AAA", "100"), price("BBB", "100")], now);
  assert.equal(result.valuationStatus, "INCOMPLETE");
  assert.equal(result.summary.marketValueForPricedHoldings, "400.00");
  assert.equal(result.positions.find((item) => item.symbol === "AAA")?.currentAllocationPercent, "75.00");
  assert.equal(result.positions.find((item) => item.symbol === "BBB")?.currentAllocationPercent, "25.00");
  assert.equal(result.positions.find((item) => item.symbol === "CCC")?.currentAllocationPercent, null);
  assert.equal(result.summary.topHoldingAllocationPercent, "75.00");
  assert.equal(result.summary.topFiveAllocationPercent, "100.00");
  assert.deepEqual(result.largestHoldings.map((item) => item.symbol), ["AAA", "BBB", "CCC"]);
});

test("rebalance preview reports percentage-point deviation and estimated buy/sell amounts", () => {
  const trades = [
    { ...trade("a", "BUY", 3, "100", "0", 1), symbol: "AAA" },
    { ...trade("b", "BUY", 1, "100", "0", 1), symbol: "BBB" },
  ];
  const portfolio = calculateStockPortfolioAnalytics(trades, [price("AAA", "100"), price("BBB", "100")], now);
  const preview = calculateRebalancePreview(portfolio, [
    { exchange: "NSE", symbol: "AAA", targetPercent: "50" },
    { exchange: "NSE", symbol: "BBB", targetPercent: "50" },
  ]);
  assert.equal(preview.totalMarketValue, "400.00");
  assert.deepEqual(preview.lines.map((line) => [line.symbol, line.deviationPercentagePoints, line.action, line.estimatedTradeAmount]), [
    ["AAA", "25.00", "SELL", "100.00"],
    ["BBB", "-25.00", "BUY", "100.00"],
  ]);
  assert.throws(() => calculateRebalancePreview(portfolio, [{ exchange: "NSE", symbol: "AAA", targetPercent: "100" }]), /TARGETS_MUST_COVER_ALL_ACTIVE_POSITIONS/);
  assert.throws(() => calculateRebalancePreview(portfolio, [
    { exchange: "NSE", symbol: "AAA", targetPercent: "40" },
    { exchange: "NSE", symbol: "BBB", targetPercent: "40" },
  ]), /TARGET_PERCENTAGES_MUST_TOTAL_100/);
});

test("reversals are excluded from valuation and incomplete or stale portfolios cannot be rebalanced", () => {
  const buy = trade("buy", "BUY", 2, "100", "0", 1);
  const reversal = { ...buy, id: "reversal", reversesTransactionId: "buy", correctionReason: "Corrected entry" };
  const empty = calculateStockPortfolioAnalytics([buy, reversal], [], now);
  assert.equal(empty.positions.length, 0);
  assert.throws(() => calculateRebalancePreview(empty, []), /TARGETS_MUST_COVER_ALL_ACTIVE_POSITIONS/);
  const stale = calculateStockPortfolioAnalytics([buy], [price("INFY", "100", new Date(now.getTime() - 8 * 86400000))], now);
  assert.throws(() => calculateRebalancePreview(stale, [{ exchange: "NSE", symbol: "INFY", targetPercent: "100" }]), /CURRENT_COMPLETE_VALUATION_REQUIRED/);
});

test("portfolio trade and price reads are scoped to the authenticated user", async () => {
  const tradeDelegate = prisma.stockTrade;
  const priceDelegate = prisma.stockPrice;
  const oldTrades = Object.getOwnPropertyDescriptor(tradeDelegate, "findMany");
  const oldPrices = Object.getOwnPropertyDescriptor(priceDelegate, "findMany");
  const queries: unknown[] = [];
  Object.defineProperty(tradeDelegate, "findMany", { configurable: true, value: async (query: unknown) => { queries.push(query); return []; } });
  Object.defineProperty(priceDelegate, "findMany", { configurable: true, value: async (query: unknown) => { queries.push(query); return []; } });
  try {
    const userId = "00000000-0000-0000-0000-000000000123";
    const result = await getStockPortfolioAnalytics(userId, now);
    assert.equal(result.valuationStatus, "COMPLETE");
    assert.deepEqual(queries.map((query: any) => query.where), [{ userId }, { userId }]);
  } finally {
    if (oldTrades) Object.defineProperty(tradeDelegate, "findMany", oldTrades);
    else delete (tradeDelegate as unknown as { findMany?: unknown }).findMany;
    if (oldPrices) Object.defineProperty(priceDelegate, "findMany", oldPrices);
    else delete (priceDelegate as unknown as { findMany?: unknown }).findMany;
  }
});
