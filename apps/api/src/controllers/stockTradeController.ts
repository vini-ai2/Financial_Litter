import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createStockTrade, getStockHoldings, getStockPortfolioAnalytics, getStockRebalancePreview, getStockTradeHistory, reverseStockTrade, upsertUserStockPrice } from "../services/stockTradeService";
import { InsufficientSharesError } from "../services/stockLedger";
import { capturePortfolioSnapshot, comparePortfolioSnapshots, getHistoricalPortfolioValuation, getPortfolioSnapshot, listPortfolioSnapshots } from "../services/portfolioSnapshotService";

const decimal = (maxScale: number, maxIntegerDigits: number, allowZero: boolean) =>
  z.string()
    .regex(new RegExp(`^(?:0|[1-9]\\d{0,${maxIntegerDigits - 1}})(?:\\.\\d{1,${maxScale}})?$`), "Enter a valid decimal amount")
    .refine((value) => {
      try { const parsed = new Prisma.Decimal(value); return allowZero ? parsed.gte(0) : parsed.gt(0); }
      catch { return false; }
    }, allowZero ? "Amount cannot be negative" : "Amount must be greater than zero");

export const createStockTradeSchema = z.object({
  exchange: z.enum(["NSE", "BSE"]),
  symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9&.-]+$/).transform((value) => value.toUpperCase()),
  companyName: z.string().trim().min(1).max(120).optional(),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().int().positive().max(2_147_483_647),
  executionPrice: decimal(6, 14, false),
  fees: decimal(2, 18, true),
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid trade date"),
});

const reversalSchema = z.object({ reason: z.string().trim().min(1).max(500) });
const stockPriceSchema = z.object({
  exchange: z.enum(["NSE", "BSE"]),
  symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9&.-]+$/).transform((value) => value.toUpperCase()),
  price: decimal(6, 14, false),
});
const rebalanceSchema = z.object({
  targets: z.array(z.object({
    exchange: z.enum(["NSE", "BSE"]),
    symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9&.-]+$/).transform((value) => value.toUpperCase()),
    targetPercent: decimal(2, 3, true),
  })).min(1).max(100),
});
const snapshotIdSchema = z.string().uuid();
const snapshotRangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).refine((range) => !range.from || !range.to || new Date(range.from) <= new Date(range.to), "from must be earlier than or equal to to");
const snapshotCompareSchema = z.object({ from: z.string().uuid(), to: z.string().uuid() });

function logStockTradeFailure(operation: string, error: unknown) {
  if (error instanceof Error) {
    console.error(`[stock ledger] ${operation} failed: ${error.name}: ${error.message}`, error.stack);
    return;
  }
  console.error(`[stock ledger] ${operation} failed:`, error);
}

export async function createStockTradeController(req: Request, res: Response) {
  const parsed = createStockTradeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid stock trade data", details: parsed.error.flatten() });
  try {
    return res.status(201).json(await createStockTrade(req.userId, parsed.data));
  } catch (error) {
    logStockTradeFailure("create trade", error);
    if (error instanceof InsufficientSharesError) {
      return res.status(409).json({ error: "Sale quantity exceeds available shares", availableQuantity: error.available });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "This trade has already been reversed" });
    }
    return res.status(500).json({ error: "Could not record stock trade" });
  }
}

export async function listStockTradeHistoryController(req: Request, res: Response) {
  try { return res.json(await getStockTradeHistory(req.userId)); }
  catch (error) { logStockTradeFailure("load trade history", error); return res.status(500).json({ error: "Could not load stock trade history" }); }
}

export async function listStockHoldingsController(req: Request, res: Response) {
  try { return res.json(await getStockHoldings(req.userId)); }
  catch (error) {
    logStockTradeFailure("calculate holdings", error);
    if (error instanceof Error && error.message === "STOCK_LEDGER_INTEGRITY_ERROR") {
      return res.status(409).json({ error: "The stock ledger needs correction before holdings can be calculated" });
    }
    return res.status(500).json({ error: "Could not calculate stock holdings" });
  }
}

export async function getStockPortfolioController(req: Request, res: Response) {
  try { return res.json(await getStockPortfolioAnalytics(req.userId)); }
  catch (error) {
    logStockTradeFailure("load portfolio analytics", error);
    if (error instanceof Error && error.message === "STOCK_LEDGER_INTEGRITY_ERROR") {
      return res.status(409).json({ error: "The stock ledger needs correction before portfolio analytics can be calculated" });
    }
    return res.status(500).json({ error: "Could not load stock portfolio analytics" });
  }
}

export async function upsertStockPriceController(req: Request, res: Response) {
  const parsed = stockPriceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid stock price", details: parsed.error.flatten() });
  try {
    const price = await upsertUserStockPrice({ userId: req.userId, ...parsed.data });
    return res.json({ exchange: price.exchange, symbol: price.symbol, price: price.price.toFixed(6), source: price.source, asOf: price.asOf.toISOString() });
  } catch (error) {
    logStockTradeFailure("save manual stock price", error);
    return res.status(500).json({ error: "Could not save stock price" });
  }
}

export async function stockRebalancePreviewController(req: Request, res: Response) {
  const parsed = rebalanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid target allocations", details: parsed.error.flatten() });
  try { return res.json(await getStockRebalancePreview(req.userId, parsed.data.targets)); }
  catch (error) {
    if (error instanceof Error) {
      const messages: Record<string, string> = {
        CURRENT_COMPLETE_VALUATION_REQUIRED: "A current price is required for every active holding before rebalancing can be estimated",
        TARGETS_MUST_COVER_ALL_ACTIVE_POSITIONS: "Set a target percentage for each active holding",
        DUPLICATE_TARGET_POSITION: "A target can only be entered once per holding",
        TARGET_PERCENT_OUT_OF_RANGE: "Target percentages must be from 0 to 100",
        TARGET_PERCENTAGES_MUST_TOTAL_100: "Target allocations must total exactly 100%",
        STOCK_LEDGER_INTEGRITY_ERROR: "The stock ledger needs correction before rebalancing can be estimated",
      };
      if (messages[error.message]) return res.status(400).json({ error: messages[error.message] });
    }
    logStockTradeFailure("calculate rebalance preview", error);
    return res.status(500).json({ error: "Could not calculate a rebalance preview" });
  }
}

export async function capturePortfolioSnapshotController(req: Request, res: Response) {
  try {
    const result = await capturePortfolioSnapshot(req.userId);
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    logStockTradeFailure("capture portfolio snapshot", error);
    if (error instanceof InsufficientSharesError) return res.status(409).json({ error: "The stock ledger needs correction before a snapshot can be captured" });
    if (error instanceof Error && error.message === "STOCK_LEDGER_INTEGRITY_ERROR") return res.status(409).json({ error: "The stock ledger needs correction before a snapshot can be captured" });
    return res.status(500).json({ error: "Could not capture portfolio snapshot" });
  }
}

function parseSnapshotRange(req: Request, res: Response) {
  const parsed = snapshotRangeSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid snapshot date range", details: parsed.error.flatten() });
    return null;
  }
  return { from: parsed.data.from ? new Date(parsed.data.from) : undefined, to: parsed.data.to ? new Date(parsed.data.to) : undefined };
}

export async function listPortfolioSnapshotsController(req: Request, res: Response) {
  const range = parseSnapshotRange(req, res);
  if (!range) return;
  try { return res.json(await listPortfolioSnapshots(req.userId, range.from, range.to)); }
  catch (error) { logStockTradeFailure("list portfolio snapshots", error); return res.status(500).json({ error: "Could not load portfolio snapshot history" }); }
}

export async function historicalPortfolioValuationController(req: Request, res: Response) {
  const range = parseSnapshotRange(req, res);
  if (!range) return;
  try { return res.json(await getHistoricalPortfolioValuation(req.userId, range.from, range.to)); }
  catch (error) { logStockTradeFailure("load historical portfolio valuation", error); return res.status(500).json({ error: "Could not load historical portfolio valuation" }); }
}

export async function comparePortfolioSnapshotsController(req: Request, res: Response) {
  const parsed = snapshotCompareSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Select two valid portfolio snapshots", details: parsed.error.flatten() });
  try {
    const comparison = await comparePortfolioSnapshots(req.userId, parsed.data.from, parsed.data.to);
    return comparison ? res.json(comparison) : res.status(404).json({ error: "Portfolio snapshot not found" });
  } catch (error) {
    if (error instanceof Error && error.message === "SNAPSHOT_RANGE_REVERSED") return res.status(400).json({ error: "The starting snapshot must be earlier than or equal to the ending snapshot" });
    logStockTradeFailure("compare portfolio snapshots", error);
    return res.status(500).json({ error: "Could not compare portfolio snapshots" });
  }
}

export async function getPortfolioSnapshotController(req: Request, res: Response) {
  const parsedId = snapshotIdSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: "Invalid portfolio snapshot ID" });
  try {
    const snapshot = await getPortfolioSnapshot(req.userId, parsedId.data);
    return snapshot ? res.json(snapshot) : res.status(404).json({ error: "Portfolio snapshot not found" });
  } catch (error) { logStockTradeFailure("load portfolio snapshot", error); return res.status(500).json({ error: "Could not load portfolio snapshot" }); }
}

export async function reverseStockTradeController(req: Request, res: Response) {
  const parsed = reversalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A correction reason is required", details: parsed.error.flatten() });
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Invalid stock trade ID" });
  try {
    const result = await reverseStockTrade(req.userId, id, parsed.data.reason);
    if (result.kind === "NOT_FOUND") return res.status(404).json({ error: "Stock trade not found" });
    if (result.kind === "ALREADY_REVERSED") return res.status(409).json({ error: "Stock trade has already been reversed" });
    return res.status(201).json(result.reversal);
  } catch (error) {
    logStockTradeFailure("reverse trade", error);
    if (error instanceof InsufficientSharesError) {
      return res.status(409).json({ error: "This correction would leave a sale without enough shares" });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "Stock trade has already been reversed" });
    }
    return res.status(500).json({ error: "Could not reverse stock trade" });
  }
}
