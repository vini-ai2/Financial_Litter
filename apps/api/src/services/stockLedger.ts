import { Prisma } from "@prisma/client";

export type StockTradeForLedger = {
  id: string;
  exchange: "NSE" | "BSE";
  symbol: string;
  companyName: string | null;
  side: "BUY" | "SELL";
  quantity: number;
  executionPrice: Prisma.Decimal | string;
  fees: Prisma.Decimal | string;
  tradeDate: Date;
  createdAt: Date;
  reversesTransactionId: string | null;
  correctionReason: string | null;
};

export type StockHolding = {
  exchange: "NSE" | "BSE";
  symbol: string;
  companyName: string | null;
  quantity: number;
  costBasis: string;
  averageCostPerShare: string;
  realizedPnl: string;
};

export class InsufficientSharesError extends Error {
  constructor(readonly exchange: string, readonly symbol: string, readonly available: number) {
    super("INSUFFICIENT_SHARES");
  }
}

/** Computes delivery holdings and realized P&L using FIFO and exact decimal arithmetic. */
export function calculateStockHoldings(trades: StockTradeForLedger[]): StockHolding[] {
  const reversedIds = new Set(
    trades.flatMap((trade) => trade.reversesTransactionId ? [trade.reversesTransactionId] : []),
  );
  const effective = trades
    .filter((trade) => !trade.reversesTransactionId && !reversedIds.has(trade.id))
    .sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime()
      || a.createdAt.getTime() - b.createdAt.getTime()
      || a.id.localeCompare(b.id));

  const groups = new Map<string, {
    exchange: "NSE" | "BSE";
    symbol: string;
    companyName: string | null;
    lots: Array<{ quantity: number; cost: Prisma.Decimal }>;
    realized: Prisma.Decimal;
  }>();

  for (const trade of effective) {
    const key = `${trade.exchange}:${trade.symbol}`;
    let group = groups.get(key);
    if (!group) {
      group = { exchange: trade.exchange, symbol: trade.symbol, companyName: trade.companyName, lots: [], realized: new Prisma.Decimal(0) };
      groups.set(key, group);
    }
    if (trade.companyName) group.companyName = trade.companyName;

    const price = new Prisma.Decimal(trade.executionPrice);
    const fees = new Prisma.Decimal(trade.fees);
    if (trade.side === "BUY") {
      group.lots.push({ quantity: trade.quantity, cost: price.mul(trade.quantity).plus(fees) });
      continue;
    }

    const available = group.lots.reduce((sum, lot) => sum + lot.quantity, 0);
    if (trade.quantity > available) {
      throw new InsufficientSharesError(trade.exchange, trade.symbol, available);
    }

    let toSell = trade.quantity;
    let matchedCost = new Prisma.Decimal(0);
    while (toSell > 0) {
      const lot = group.lots[0];
      const matched = Math.min(toSell, lot.quantity);
      const allocatedCost = lot.cost.mul(matched).div(lot.quantity);
      matchedCost = matchedCost.plus(allocatedCost);
      lot.quantity -= matched;
      lot.cost = lot.cost.minus(allocatedCost);
      toSell -= matched;
      if (lot.quantity === 0) group.lots.shift();
    }
    group.realized = group.realized.plus(price.mul(trade.quantity).minus(fees).minus(matchedCost));
  }

  return [...groups.values()]
    .filter((group) => group.lots.length > 0)
    .map((group) => {
      const quantity = group.lots.reduce((sum, lot) => sum + lot.quantity, 0);
      const costBasis = group.lots.reduce((sum, lot) => sum.plus(lot.cost), new Prisma.Decimal(0));
      return {
        exchange: group.exchange,
        symbol: group.symbol,
        companyName: group.companyName,
        quantity,
        costBasis: costBasis.toFixed(2),
        averageCostPerShare: quantity ? costBasis.div(quantity).toFixed(6) : "0.000000",
        realizedPnl: group.realized.toFixed(2),
      };
    });
}

export function validateStockLedger(trades: StockTradeForLedger[]) {
  calculateStockHoldings(trades);
}
