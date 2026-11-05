import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { financeApi, stockInvestmentApi } from "@/lib/api";

type LegacyInvestment = {
  id: string;
  name: string;
  category: string;
  investedAmount: number | string;
  currentValue: number | string;
  purchaseDate: string;
};

type StockHolding = {
  exchange: "NSE" | "BSE";
  symbol: string;
  companyName: string | null;
  quantity: number;
  costBasis: string;
  averageCostPerShare: string;
  realizedPnl: string;
};

type StockTrade = {
  id: string;
  exchange: "NSE" | "BSE";
  symbol: string;
  companyName: string | null;
  side: "BUY" | "SELL";
  quantity: number;
  executionPrice: string;
  fees: string;
  tradeDate: string;
  status: "ACTIVE" | "REVERSED" | "REVERSAL";
  reversesTransactionId: string | null;
  correctionReason: string | null;
  reversal: { id: string; correctionReason: string | null } | null;
};

type InvestmentsData = {
  legacy: LegacyInvestment[];
  holdings: StockHolding[];
  trades: StockTrade[];
};

const input = "field-input";
const button = "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50";
const secondaryButton = "rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm font-medium transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const rupees = (value: number | string, digits = 2) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(Number(value));
const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const Route = createFileRoute("/investments")({
  head: () => ({ meta: [{ title: "Investments · Finlitter" }] }),
  component: InvestmentsPage,
});

function InvestmentsPage() {
  const [data, setData] = useState<InvestmentsData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [correctionId, setCorrectionId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboard, holdings, trades] = await Promise.all([
        financeApi.dashboard(),
        stockInvestmentApi.holdings(),
        stockInvestmentApi.transactions(),
      ]);
      setData({ legacy: dashboard.investments ?? [], holdings, trades });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load investment data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submitTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await stockInvestmentApi.createTransaction({
        exchange: String(values.get("exchange")) as "NSE" | "BSE",
        symbol: String(values.get("symbol")),
        companyName: String(values.get("companyName") || "").trim() || undefined,
        side: String(values.get("side")) as "BUY" | "SELL",
        quantity: Number(values.get("quantity")),
        executionPrice: String(values.get("executionPrice")),
        fees: String(values.get("fees")),
        tradeDate: String(values.get("tradeDate")),
      });
      form.reset();
      setNotice("Trade recorded. Holdings and FIFO cost basis have been refreshed.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record this trade.");
    } finally {
      setSaving(false);
    }
  }

  async function submitCorrection(event: FormEvent<HTMLFormElement>, tradeId: string) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
    setSaving(true);
    setError("");
    try {
      await stockInvestmentApi.reverseTransaction(tradeId, reason);
      setCorrectionId("");
      setNotice("Trade reversed. Enter a replacement trade if needed.");
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not reverse this trade.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="bg-auth-glow min-h-screen px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <nav aria-label="Main navigation" className="flex items-center justify-between border-b border-border pb-3">
          <Link to="/" className="text-sm font-semibold tracking-tight">Finlitter</Link>
          <Link to="/" className={secondaryButton}>Finance overview</Link>
        </nav>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="field-label">Indian equities · manual records</p>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Investments</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Record completed stock trades and review FIFO holdings from your own transaction history.</p>
          </div>
          <button className={secondaryButton} onClick={() => void load()} disabled={loading}>Refresh</button>
        </header>

        {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">{notice}</div>}

        <section aria-labelledby="entry-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-5">
            <h2 id="entry-heading" className="font-display text-lg font-bold">Record a completed trade</h2>
            <p className="mt-1 text-sm text-muted-foreground">Enter trade details from your contract note. This records trades only; it does not place orders or provide intraday assistance.</p>
          </div>
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submitTrade}>
            <label className="grid gap-1.5"><span className="field-label">Action</span><select className={input} name="side" required><option value="BUY">Buy</option><option value="SELL">Sell</option></select></label>
            <label className="grid gap-1.5"><span className="field-label">Exchange</span><select className={input} name="exchange" required><option value="NSE">NSE</option><option value="BSE">BSE</option></select></label>
            <label className="grid gap-1.5"><span className="field-label">Trading symbol</span><input className={input} name="symbol" autoComplete="off" maxLength={20} pattern="[A-Za-z0-9&.-]+" placeholder="e.g. INFY" required /></label>
            <label className="grid gap-1.5"><span className="field-label">Company name (optional)</span><input className={input} name="companyName" maxLength={120} autoComplete="off" /></label>
            <label className="grid gap-1.5"><span className="field-label">Quantity (shares)</span><input className={input} name="quantity" type="number" min="1" max="2147483647" step="1" required /></label>
            <label className="grid gap-1.5"><span className="field-label">Execution price (₹ / share)</span><input className={input} name="executionPrice" type="number" min="0.000001" step="any" inputMode="decimal" required /></label>
            <label className="grid gap-1.5"><span className="field-label">Fees (₹)</span><input className={input} name="fees" type="number" min="0" step="0.01" defaultValue="0" inputMode="decimal" required /></label>
            <label className="grid gap-1.5"><span className="field-label">Trade date</span><input className={input} name="tradeDate" type="date" defaultValue={today()} required /></label>
            <div className="sm:col-span-2 lg:col-span-4"><button className={button} type="submit" disabled={saving}>{saving ? "Saving trade…" : "Record trade"}</button></div>
          </form>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">Whole shares only. Prices accept up to 6 decimal places; fees are recorded in rupees to 2 decimal places. Same-day trades are ordered by entry time in the ledger.</p>
        </section>

        <section aria-labelledby="holdings-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-5">
            <h2 id="holdings-heading" className="font-display text-lg font-bold">Holdings</h2>
            <p className="mt-1 text-sm text-muted-foreground">Remaining quantity and cost basis are derived by the finance service using FIFO lots. No market price is available.</p>
          </div>
          {loading && !data && <p role="status" className="rounded-xl bg-secondary/30 p-4 text-sm text-muted-foreground">Loading holdings…</p>}
          {data && data.holdings.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No active stock holdings. Record a completed buy trade to get started.</p>}
          {!!data?.holdings.length && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground"><th scope="col" className="pb-3 pr-4 font-medium">Stock</th><th scope="col" className="pb-3 pr-4 font-medium">Exchange</th><th scope="col" className="pb-3 pr-4 text-right font-medium">Shares</th><th scope="col" className="pb-3 pr-4 text-right font-medium">Avg FIFO cost / share</th><th scope="col" className="pb-3 pr-4 text-right font-medium">Remaining cost basis</th><th scope="col" className="pb-3 text-right font-medium">Realized P&amp;L</th></tr></thead>
                <tbody>{data.holdings.map((holding) => (
                  <tr key={`${holding.exchange}:${holding.symbol}`} className="border-b border-border last:border-0">
                    <th scope="row" className="py-4 pr-4 font-semibold">{holding.companyName ? <>{holding.companyName}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">{holding.symbol}</span></> : holding.symbol}</th>
                    <td className="py-4 pr-4 text-muted-foreground">{holding.exchange}</td>
                    <td className="py-4 pr-4 text-right tabular-nums">{holding.quantity.toLocaleString("en-IN")}</td>
                    <td className="py-4 pr-4 text-right tabular-nums">{rupees(holding.averageCostPerShare, 4)}</td>
                    <td className="py-4 pr-4 text-right tabular-nums">{rupees(holding.costBasis)}</td>
                    <td className="py-4 text-right tabular-nums">{rupees(holding.realizedPnl)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="history-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-5">
            <h2 id="history-heading" className="font-display text-lg font-bold">Transaction history</h2>
            <p className="mt-1 text-sm text-muted-foreground">Trades are immutable. Correct an entry by recording a reversal with a reason, then adding the replacement trade.</p>
          </div>
          {data?.trades.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No stock trades recorded yet.</p>}
          {!!data?.trades.length && <div className="space-y-3">
            {data.trades.map((trade) => (
              <article key={trade.id} className={`rounded-xl border p-4 ${trade.status === "ACTIVE" ? "border-border bg-secondary/20" : "border-border/70 bg-secondary/10 opacity-80"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{trade.side} · {trade.symbol} <span className="font-normal text-muted-foreground">({trade.exchange})</span></p>
                    <p className="mt-1 text-xs text-muted-foreground">{dateLabel(trade.tradeDate)} · {trade.quantity.toLocaleString("en-IN")} shares at {rupees(trade.executionPrice, 4)} · fees {rupees(trade.fees)}</p>
                    {trade.status === "REVERSAL" && <p className="mt-1 text-xs text-muted-foreground">Reversal entry · {trade.correctionReason}</p>}
                    {trade.status === "REVERSED" && <p className="mt-1 text-xs text-muted-foreground">Reversed · {trade.reversal?.correctionReason}</p>}
                  </div>
                  {trade.status === "ACTIVE" && <button className={secondaryButton} disabled={saving} onClick={() => setCorrectionId(correctionId === trade.id ? "" : trade.id)}>Correct</button>}
                </div>
                {correctionId === trade.id && <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void submitCorrection(event, trade.id)}>
                  <label className="grid flex-1 gap-1.5"><span className="field-label">Correction reason</span><input className={input} name="reason" maxLength={500} required placeholder="Explain why this trade is being reversed" /></label>
                  <button className={button} type="submit" disabled={saving}>Reverse trade</button>
                </form>}
              </article>
            ))}
          </div>}
        </section>

        <section aria-labelledby="legacy-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <h2 id="legacy-heading" className="font-display text-lg font-bold">Existing investment records</h2>
          <p className="mt-1 text-sm text-muted-foreground">These older aggregate entries remain separate from the stock ledger and continue to feed existing finance overview totals. They are not converted because they have no stock quantity or exchange details.</p>
          {data?.legacy.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No existing aggregate records.</p>}
          {!!data?.legacy.length && <ul className="mt-4 divide-y divide-border">{data.legacy.map((record) => <li key={record.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{record.name} <span className="text-xs text-muted-foreground">· {record.category.replaceAll("_", " ").toLowerCase()}</span></span><span className="tabular-nums text-muted-foreground">Invested {rupees(record.investedAmount)} · stored value {rupees(record.currentValue)}</span></li>)}</ul>}
        </section>

        <p className="text-xs leading-5 text-muted-foreground">Stock ledger figures reflect manually entered trades only. No live or delayed quotes, corporate actions, brokerage execution, tax-lot reporting, or intraday assistance is connected.</p>
      </div>
    </main>
  );
}
