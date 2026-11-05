import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createStockTrade, getStockHoldings, getStockTradeHistory, reverseStockTrade } from "../services/stockTradeService";
import { InsufficientSharesError } from "../services/stockLedger";

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

export async function createStockTradeController(req: Request, res: Response) {
  const parsed = createStockTradeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid stock trade data", details: parsed.error.flatten() });
  try {
    return res.status(201).json(await createStockTrade(req.userId, parsed.data));
  } catch (error) {
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
  catch { return res.status(500).json({ error: "Could not load stock trade history" }); }
}

export async function listStockHoldingsController(req: Request, res: Response) {
  try { return res.json(await getStockHoldings(req.userId)); }
  catch (error) {
    if (error instanceof Error && error.message === "STOCK_LEDGER_INTEGRITY_ERROR") {
      return res.status(409).json({ error: "The stock ledger needs correction before holdings can be calculated" });
    }
    return res.status(500).json({ error: "Could not calculate stock holdings" });
  }
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
    if (error instanceof InsufficientSharesError) {
      return res.status(409).json({ error: "This correction would leave a sale without enough shares" });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "Stock trade has already been reversed" });
    }
    return res.status(500).json({ error: "Could not reverse stock trade" });
  }
}
