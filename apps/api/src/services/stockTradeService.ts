import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { calculateStockHoldings, InsufficientSharesError, type StockTradeForLedger } from "./stockLedger";

export type CreateStockTradeInput = {
  exchange: "NSE" | "BSE";
  symbol: string;
  companyName?: string;
  side: "BUY" | "SELL";
  quantity: number;
  executionPrice: string;
  fees: string;
  tradeDate: string;
};

const toDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15_000,
        timeout: 30_000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }
}

async function tradesFor(tx: Prisma.TransactionClient, userId: string, exchange: "NSE" | "BSE", symbol: string) {
  return tx.stockTrade.findMany({ where: { userId, exchange, symbol }, orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
}

export async function createStockTrade(userId: string, input: CreateStockTradeInput) {
  return serializable(async (tx) => {
    const created = await tx.stockTrade.create({
      data: {
        userId,
        exchange: input.exchange,
        symbol: input.symbol,
        companyName: input.companyName || null,
        side: input.side,
        quantity: input.quantity,
        executionPrice: new Prisma.Decimal(input.executionPrice),
        fees: new Prisma.Decimal(input.fees),
        tradeDate: toDate(input.tradeDate),
      },
    });
    const allTrades = await tradesFor(tx, userId, input.exchange, input.symbol);
    calculateStockHoldings(allTrades as StockTradeForLedger[]);
    return created;
  });
}

export async function reverseStockTrade(userId: string, tradeId: string, reason: string) {
  return serializable(async (tx) => {
    const original = await tx.stockTrade.findFirst({ where: { id: tradeId, userId } });
    if (!original || original.reversesTransactionId) return { kind: "NOT_FOUND" as const };
    if (await tx.stockTrade.findUnique({ where: { reversesTransactionId: original.id } })) return { kind: "ALREADY_REVERSED" as const };

    const reversal = await tx.stockTrade.create({
      data: {
        userId,
        exchange: original.exchange,
        symbol: original.symbol,
        companyName: original.companyName,
        side: original.side,
        quantity: original.quantity,
        executionPrice: original.executionPrice,
        fees: original.fees,
        tradeDate: original.tradeDate,
        reversesTransactionId: original.id,
        correctionReason: reason,
      },
    });
    const allTrades = await tradesFor(tx, userId, original.exchange, original.symbol);
    calculateStockHoldings(allTrades as StockTradeForLedger[]);
    return { kind: "REVERSED" as const, reversal };
  });
}

export async function getStockTradeHistory(userId: string) {
  const trades = await prisma.stockTrade.findMany({
    where: { userId },
    include: { reversal: { select: { id: true, correctionReason: true, createdAt: true } } },
    orderBy: [{ tradeDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  return trades.map((trade) => ({
    ...trade,
    status: trade.reversesTransactionId ? "REVERSAL" : trade.reversal ? "REVERSED" : "ACTIVE",
  }));
}

export async function getStockHoldings(userId: string) {
  const trades = await prisma.stockTrade.findMany({ where: { userId }, orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
  try {
    return calculateStockHoldings(trades as StockTradeForLedger[]);
  } catch (error) {
    if (error instanceof InsufficientSharesError) throw new Error("STOCK_LEDGER_INTEGRITY_ERROR");
    throw error;
  }
}
