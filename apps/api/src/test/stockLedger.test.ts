import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { createStockTradeSchema } from "../controllers/stockTradeController";
import { calculateStockHoldings, type StockTradeForLedger } from "../services/stockLedger";
import { getStockTradeHistory } from "../services/stockTradeService";

const userOneTrade = (id: string, side: "BUY" | "SELL", quantity: number, price: string, fees: string, day: number, created: number): StockTradeForLedger => ({
  id,
  exchange: "NSE",
  symbol: "INFY",
  companyName: "Infosys",
  side,
  quantity,
  executionPrice: new Prisma.Decimal(price),
  fees: new Prisma.Decimal(fees),
  tradeDate: new Date(Date.UTC(2026, 0, day)),
  createdAt: new Date(created),
  reversesTransactionId: null,
  correctionReason: null,
});

test("FIFO calculates remaining shares, acquisition fees, and realized sale fees exactly", () => {
  const holdings = calculateStockHoldings([
    userOneTrade("buy-1", "BUY", 2, "100.25", "1.00", 1, 1),
    userOneTrade("buy-2", "BUY", 3, "120.00", "1.50", 2, 2),
    userOneTrade("sell-1", "SELL", 3, "130.00", "2.00", 3, 3),
  ]);
  assert.deepEqual(holdings, [{
    exchange: "NSE", symbol: "INFY", companyName: "Infosys", quantity: 2,
    costBasis: "241.00", averageCostPerShare: "120.500000", realizedPnl: "66.00",
  }]);
});

test("FIFO uses entry order for same-day trades and rejects overselling", () => {
  const buy = userOneTrade("buy", "BUY", 4, "10", "0", 1, 1);
  const sell = userOneTrade("sell", "SELL", 5, "11", "0", 1, 2);
  assert.throws(() => calculateStockHoldings([buy, sell]), /INSUFFICIENT_SHARES/);
});

test("a reversal removes the original trade from holdings without deleting history", () => {
  const buy = userOneTrade("buy", "BUY", 4, "10", "0.20", 1, 1);
  const reversal: StockTradeForLedger = {
    ...buy,
    id: "reversal",
    createdAt: new Date(2),
    reversesTransactionId: "buy",
    correctionReason: "Entered against wrong contract note",
  };
  assert.deepEqual(calculateStockHoldings([buy, reversal]), []);
});

test("trade validation normalizes symbols and validates date and decimal precision", () => {
  const parsed = createStockTradeSchema.safeParse({
    exchange: "NSE", symbol: " infy ", side: "BUY", quantity: 10,
    executionPrice: "125.123456", fees: "1.25", tradeDate: "2026-10-30",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.symbol, "INFY");
  assert.equal(createStockTradeSchema.safeParse({
    exchange: "NSE", symbol: "INFY", side: "BUY", quantity: 1,
    executionPrice: "0", fees: "0", tradeDate: "2026-02-30",
  }).success, false);
  assert.equal(createStockTradeSchema.safeParse({
    exchange: "NSE", symbol: "INFY", side: "BUY", quantity: 1,
    executionPrice: "1.0000001", fees: "0", tradeDate: "2026-02-28",
  }).success, false);
});

test("authenticated middleware rejects absent and invalid tokens and attaches the token owner", async () => {
  process.env.JWT_SECRET = "stock-ledger-test-secret";
  const jwt = (await import("jsonwebtoken")).default;
  const { authenticate } = await import("../middleware/authMiddleware.js");
  const userId = "00000000-0000-0000-0000-000000000001";
  const invoke = (authorization?: string) => {
    const req = { headers: authorization ? { authorization } : {} } as unknown as Request;
    let statusCode = 200;
    const res = {
      status(code: number) { statusCode = code; return this; },
      json() { return this; },
    } as unknown as Response;
    let continued = false;
    authenticate(req, res, () => { continued = true; });
    return { req, statusCode, continued };
  };
  const absent = invoke();
  assert.equal(absent.statusCode, 401);
  assert.equal(absent.continued, false);
  const invalid = invoke("Bearer not-a-token");
  assert.equal(invalid.statusCode, 401);
  const token = jwt.sign({ userId }, "stock-ledger-test-secret", { expiresIn: "1m" });
  const valid = invoke(`Bearer ${token}`);
  assert.equal(valid.continued, true);
  assert.equal(valid.req.userId, userId);
  delete process.env.JWT_SECRET;
});

test("history query is scoped to the authenticated user", async () => {
  const delegate = prisma.stockTrade;
  const previous = Object.getOwnPropertyDescriptor(delegate, "findMany");
  let where: unknown;
  Object.defineProperty(delegate, "findMany", {
    configurable: true,
    value: async (query: { where: unknown }) => { where = query.where; return []; },
  });
  try {
    const userId = "00000000-0000-0000-0000-000000000002";
    assert.deepEqual(await getStockTradeHistory(userId), []);
    assert.deepEqual(where, { userId });
  } finally {
    if (previous) Object.defineProperty(delegate, "findMany", previous);
    else delete (delegate as unknown as { findMany?: unknown }).findMany;
  }
});
