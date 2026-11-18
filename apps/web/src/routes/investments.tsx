import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { financeApi, restoreAccessToken, stockInvestmentApi, type PortfolioSnapshotSummary, type PortfolioSnapshotHolding } from "@/lib/api";
import { AuthenticatedShell } from "@/components/authenticated-shell";

type LegacyInvestment = {
  id: string;
  name: string;
  category: string;
  investedAmount: number | string;
  currentValue: number | string;
  purchaseDate: string;
};

type PortfolioPosition = {
  exchange: "NSE" | "BSE";
  symbol: string;
  companyName: string | null;
  quantity: number;
  costBasis: string;
  averageCostPerShare: string;
  realizedPnl: string;
  price: string | null;
  priceSource: string | null;
  priceAsOf: string | null;
  priceStatus: "CURRENT" | "STALE" | "MISSING";
  marketValue: string | null;
  unrealizedPnl: string | null;
  currentAllocationPercent: string | null;
};

type StockPortfolio = {
  valuationStatus: "COMPLETE" | "INCOMPLETE" | "STALE";
  asOf: string;
  positions: PortfolioPosition[];
  realizedBySymbol: Array<{ exchange: "NSE" | "BSE"; symbol: string; realizedPnl: string }>;
  largestHoldings: PortfolioPosition[];
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
};

type RebalancePreview = {
  totalMarketValue: string;
  lines: Array<{
    exchange: "NSE" | "BSE";
    symbol: string;
    currentAllocationPercent: string;
    targetAllocationPercent: string;
    deviationPercentagePoints: string;
    estimatedTradeAmount: string;
    action: "BUY" | "SELL" | "HOLD";
  }>;
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
  portfolio: StockPortfolio;
  trades: StockTrade[];
};

const input = "field-input";
const button = "rounded-md bg-primary px-4 py-2.5 font-ui text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50";
const secondaryButton = "rounded-md border border-border bg-secondary/30 px-3 py-2 font-ui text-sm font-medium transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const rupees = (value: number | string, digits = 2) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(Number(value));
const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timestampLabel = (value: string) => new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const stockKey = (exchange: string, symbol: string) => `${exchange}:${symbol}`;
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const Route = createFileRoute("/investments")({
  head: () => ({ meta: [{ title: "Investments · Finlitter" }] }),
  component: InvestmentsPage,
});

function InvestmentsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<InvestmentsData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [correctionId, setCorrectionId] = useState("");
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>({});
  const [rebalance, setRebalance] = useState<RebalancePreview | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshotSummary[]>([]);
  const [snapshotDetail, setSnapshotDetail] = useState<(PortfolioSnapshotSummary & { holdings: PortfolioSnapshotHolding[] }) | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotError, setSnapshotError] = useState("");
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [periodStartId, setPeriodStartId] = useState("");
  const [periodEndId, setPeriodEndId] = useState("");
  const [periodComparison, setPeriodComparison] = useState<Awaited<ReturnType<typeof stockInvestmentApi.compareSnapshots>> | null>(null);
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const tradeDialog = useRef<HTMLDialogElement>(null);
  const chartMaximum = Math.max(1, ...snapshots.map((snapshot) => Number(snapshot.marketValueForPricedHoldings) || 0));
  const chartPoints = snapshots.map((snapshot, index) => {
    const x = snapshots.length < 2 ? 360 : 30 + (index / (snapshots.length - 1)) * 660;
    const value = Number(snapshot.marketValueForPricedHoldings) || 0;
    const y = 145 - (value / chartMaximum) * 120;
    return { snapshot, x, y };
  });

  useEffect(() => {
    const dialog = tradeDialog.current;
    if (!dialog) return;
    if (tradeOpen && !dialog.open) dialog.showModal();
    if (!tradeOpen && dialog.open) dialog.close();
  }, [tradeOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboard, portfolio, trades, history] = await Promise.all([
        financeApi.dashboard(),
        stockInvestmentApi.portfolio(),
        stockInvestmentApi.transactions(),
        stockInvestmentApi.historicalValuation(),
      ]);
      setData({ legacy: dashboard.investments ?? [], portfolio, trades });
      setSnapshots(history);
      setSelectedSnapshotId((current) => history.some((snapshot: PortfolioSnapshotSummary) => snapshot.id === current) ? current : history.at(-1)?.id ?? "");
      setPeriodStartId((current) => history.some((snapshot: PortfolioSnapshotSummary) => snapshot.id === current) ? current : history[0]?.id ?? "");
      setPeriodEndId((current) => history.some((snapshot: PortfolioSnapshotSummary) => snapshot.id === current) ? current : history.at(-1)?.id ?? "");
      setSnapshotError("");
      setPriceInputs((current) => Object.fromEntries(portfolio.positions.map((position: PortfolioPosition) => [
        stockKey(position.exchange, position.symbol), position.price ?? current[stockKey(position.exchange, position.symbol)] ?? "",
      ])));
      setTargetInputs((current) => Object.fromEntries(portfolio.positions.map((position: PortfolioPosition) => [
        stockKey(position.exchange, position.symbol), current[stockKey(position.exchange, position.symbol)] ?? "",
      ])));
      setRebalance(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load investment data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedSnapshotId) { setSnapshotDetail(null); return; }
    let active = true;
    setSnapshotBusy(true);
    stockInvestmentApi.snapshot(selectedSnapshotId).then((snapshot) => {
      if (active) { setSnapshotDetail(snapshot); setSnapshotError(""); }
    }).catch((reason) => {
      if (active) setSnapshotError(reason instanceof Error ? reason.message : "Could not load snapshot details.");
    }).finally(() => { if (active) setSnapshotBusy(false); });
    return () => { active = false; };
  }, [selectedSnapshotId]);

  useEffect(() => {
    if (!periodStartId || !periodEndId) { setPeriodComparison(null); return; }
    let active = true;
    setComparisonBusy(true);
    stockInvestmentApi.compareSnapshots(periodStartId, periodEndId).then((comparison) => {
      if (active) { setPeriodComparison(comparison); setSnapshotError(""); }
    }).catch((reason) => {
      if (active) { setPeriodComparison(null); setSnapshotError(reason instanceof Error ? reason.message : "Could not compare these snapshots."); }
    }).finally(() => { if (active) setComparisonBusy(false); });
    return () => { active = false; };
  }, [periodStartId, periodEndId]);

  async function captureSnapshot() {
    setSnapshotBusy(true);
    setSnapshotError("");
    setError("");
    try {
      const result = await stockInvestmentApi.captureSnapshot();
      const history = await stockInvestmentApi.historicalValuation();
      setSnapshots(history);
      setSelectedSnapshotId(result.snapshot.id);
      setPeriodEndId(result.snapshot.id);
      if (!periodStartId) setPeriodStartId(history[0]?.id ?? result.snapshot.id);
      setNotice(result.duplicate ? "A snapshot already exists for this capture second; the stored snapshot was returned." : "Portfolio snapshot captured and stored.");
    } catch (reason) {
      setSnapshotError(reason instanceof Error ? reason.message : "Could not capture this portfolio snapshot.");
    } finally {
      setSnapshotBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    restoreAccessToken().then((hasSession) => {
      if (!active) return;
      if (hasSession) void load();
      else void navigate({ to: "/login", replace: true });
    }).catch(() => {
      if (!active) return;
      setError("Could not connect to the finance service. Check the backend, then retry.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [load, navigate]);

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
      setTradeOpen(false);
      setNotice("Trade recorded. Holdings and FIFO cost basis have been refreshed.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record this trade.");
    } finally {
      setSaving(false);
    }
  }

  async function submitPrice(event: FormEvent<HTMLFormElement>, holding: PortfolioPosition) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await stockInvestmentApi.savePrice({ exchange: holding.exchange, symbol: holding.symbol, price: String(values.get("price")) });
      setNotice(`Manual latest price saved for ${holding.symbol}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the manual latest price.");
    } finally {
      setSaving(false);
    }
  }

  async function calculateRebalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const targets = data.portfolio.positions.map((holding) => ({
      exchange: holding.exchange,
      symbol: holding.symbol,
      targetPercent: String(new FormData(event.currentTarget).get(stockKey(holding.exchange, holding.symbol)) ?? ""),
    }));
    setSaving(true);
    setError("");
    setRebalance(null);
    try {
      setRebalance(await stockInvestmentApi.rebalancePreview(targets));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not calculate the rebalance preview.");
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
    <AuthenticatedShell active="investments">
      <div className="investment-page space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Investments</h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">Record completed stock trades and review holdings, cost basis and history.</p>
          </div>
          <div className="flex gap-2">
            <button className={secondaryButton} onClick={() => void load()} disabled={loading}>Refresh</button>
            <button className={button} type="button" onClick={() => setTradeOpen(true)}>Record trade</button>
            <dialog ref={tradeDialog} className="trade-dialog" aria-labelledby="trade-dialog-title" onClose={() => setTradeOpen(false)}>
              <div className="mb-6 pr-8">
                <h2 id="trade-dialog-title" className="font-display text-xl font-semibold">Record a completed trade</h2>
                <p className="mt-2 text-sm text-muted-foreground">Use the details from your contract note. This records trades only; it does not place orders or provide intraday assistance.</p>
              </div>
              <button className="trade-dialog__close" type="button" aria-label="Close trade entry" onClick={() => setTradeOpen(false)}>×</button>
                <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitTrade}>
                  <label className="grid gap-1.5"><span className="field-label">Action</span><select className={input} name="side" required><option value="BUY">Buy</option><option value="SELL">Sell</option></select></label>
                  <label className="grid gap-1.5"><span className="field-label">Exchange</span><select className={input} name="exchange" required><option value="NSE">NSE</option><option value="BSE">BSE</option></select></label>
                  <label className="grid gap-1.5 sm:col-span-2"><span className="field-label">Trading symbol</span><input className={input} name="symbol" autoComplete="off" maxLength={20} pattern="[A-Za-z0-9&.\-]+" placeholder="e.g. INFY" required /></label>
                  <label className="grid gap-1.5 sm:col-span-2"><span className="field-label">Company name (optional)</span><input className={input} name="companyName" maxLength={120} autoComplete="off" /></label>
                  <label className="grid gap-1.5"><span className="field-label">Quantity (shares)</span><input className={input} name="quantity" type="number" min="1" max="2147483647" step="1" required /></label>
                  <label className="grid gap-1.5"><span className="field-label">Execution price (₹ / share)</span><input className={input} name="executionPrice" type="number" min="0.000001" step="any" inputMode="decimal" required /></label>
                  <label className="grid gap-1.5"><span className="field-label">Fees (₹)</span><input className={input} name="fees" type="number" min="0" step="0.01" defaultValue="0" inputMode="decimal" required /></label>
                  <label className="grid gap-1.5"><span className="field-label">Trade date</span><input className={input} name="tradeDate" type="date" defaultValue={today()} required /></label>
                  <button className="sm:col-span-2 rounded-md bg-primary px-4 py-3 font-ui text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50" type="submit" disabled={saving}>{saving ? "Saving trade…" : "Record trade"}</button>
                </form>
                <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">Whole shares only. Prices accept up to 6 decimal places; fees are recorded in rupees to 2 decimal places. Same-day trades are ordered by entry time in the ledger.</p>
            </dialog>
          </div>
        </header>

        <section className="portfolio-summary" aria-label="Portfolio overview">
          <div><p className="field-label">Active positions</p><p className="font-display mt-1 text-xl font-semibold tabular-nums">{data ? data.portfolio.summary.activePositionCount : "—"}</p></div>
          <div><p className="field-label">Invested cost basis</p><p className="font-display mt-1 text-xl font-semibold tabular-nums">{data ? rupees(data.portfolio.summary.investedCostBasis) : "—"}</p></div>
          <div><p className="field-label">Market value</p><p className="font-display mt-1 text-xl font-semibold tabular-nums">{data?.portfolio.summary.totalMarketValue !== null && data ? rupees(data.portfolio.summary.totalMarketValue) : "Incomplete"}</p><p className="mt-1 text-xs text-muted-foreground">{data ? `Known priced holdings: ${rupees(data.portfolio.summary.marketValueForPricedHoldings)}` : "Waiting for valuation"}</p></div>
          <div><p className="field-label">Stock ledger entries</p><p className="font-display mt-1 text-xl font-semibold tabular-nums">{data ? data.trades.length : "—"}</p></div>
        </section>

        {error && <div role="alert" className="investment-notice--error rounded-md border px-4 py-3 text-sm">{error}</div>}
        {notice && <div role="status" className="investment-notice--success rounded-md border px-4 py-3 text-sm">{notice}</div>}

        <div className="investment-ledger space-y-10">
            {data && data.portfolio.valuationStatus !== "COMPLETE" && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${data.portfolio.valuationStatus === "STALE" ? "investment-notice--info" : "investment-notice--info"}`}>
              {data.portfolio.valuationStatus === "INCOMPLETE"
                ? `${data.portfolio.summary.missingPriceCount} active holding${data.portfolio.summary.missingPriceCount === 1 ? " has" : "s have"} no manual price. Total portfolio market value and total unrealised P&L remain incomplete.`
                : `${data.portfolio.summary.stalePriceCount} manual price${data.portfolio.summary.stalePriceCount === 1 ? " is" : "s are"} older than 7 days or future-dated. Update prices to mark the valuation current.`}
            </div>}

            <section aria-labelledby="snapshot-heading" className="investment-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><h2 id="snapshot-heading" className="font-display mt-1 text-xl font-semibold">Historical portfolio snapshots</h2><p className="mt-1 text-sm text-muted-foreground">Snapshots preserve the prices and FIFO values captured at that time. Only snapshots you explicitly capture appear here.</p></div>
                <button className={button} type="button" onClick={() => void captureSnapshot()} disabled={snapshotBusy || loading}>{snapshotBusy ? "Saving snapshot…" : "Capture current snapshot"}</button>
              </div>
              {snapshotError && <p role="alert" className="mt-3 rounded-md border border-loss/30 px-3 py-2 text-sm text-loss">{snapshotError}</p>}
              {loading && !data && <p role="status" className="py-5 text-sm text-muted-foreground">Loading snapshot history…</p>}
              {!loading && snapshots.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">No historical valuation yet. Capture a snapshot to begin a history using the prices currently entered.</p>}
              {snapshots.length > 0 && <>
                <div className="mt-5 rounded-xl border border-border p-3 sm:p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-semibold">Known portfolio value over time</h3><span className="text-xs text-muted-foreground">INR · snapshots only</span></div>
                  <div className="overflow-x-auto">
                    <svg className="h-48 min-w-[520px] w-full text-primary" viewBox="0 0 720 180" role="img" aria-label="Known priced holdings market value for captured portfolio snapshots">
                      <line x1="30" y1="145" x2="690" y2="145" stroke="currentColor" opacity=".2" />
                      {chartPoints.length > 1 && <polyline points={chartPoints.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2.5" />}
                      {chartPoints.map(({ snapshot, x, y }) => <circle key={snapshot.id} cx={x} cy={y} r="5" fill={snapshot.valuationStatus === "COMPLETE" ? "currentColor" : "var(--background)"} stroke="currentColor" strokeWidth="2"><title>{timestampLabel(snapshot.capturedAt)}: {rupees(snapshot.marketValueForPricedHoldings)} known priced holdings, {snapshot.valuationStatus.toLowerCase()}</title></circle>)}
                    </svg>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">The chart plots the market value of priced holdings captured in each snapshot. Open markers indicate incomplete or stale valuation; the amount is not a complete portfolio total in those snapshots.</p>
                </div>

                <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="investment-table w-full min-w-[650px] text-left text-sm">
                      <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-3 py-3">Captured</th><th className="px-3 py-3 text-right">Known value</th><th className="px-3 py-3 text-right">Realised P&amp;L</th><th className="px-3 py-3 text-right">Known unrealised P&amp;L</th><th className="px-3 py-3">Valuation</th></tr></thead>
                      <tbody>{snapshots.slice().reverse().map((snapshot) => <tr key={snapshot.id} className={`border-b border-border last:border-0 ${selectedSnapshotId === snapshot.id ? "bg-secondary/40" : ""}`}>
                        <td className="px-3 py-3"><button className="text-left font-medium text-primary underline-offset-4 hover:underline" type="button" onClick={() => setSelectedSnapshotId(snapshot.id)}>{timestampLabel(snapshot.capturedAt)}</button></td>
                        <td className="px-3 py-3 text-right tabular-nums">{rupees(snapshot.marketValueForPricedHoldings)}</td><td className="px-3 py-3 text-right tabular-nums">{rupees(snapshot.realizedPnl)}</td><td className="px-3 py-3 text-right tabular-nums">{rupees(snapshot.unrealizedPnlForPricedHoldings)}</td>
                        <td className="px-3 py-3">{snapshot.valuationStatus === "COMPLETE" ? "Complete" : snapshot.valuationStatus === "STALE" ? `Stale · ${snapshot.stalePriceCount}` : `Incomplete · ${snapshot.missingPriceCount} missing`}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <h3 className="font-display font-semibold">Compare selected period</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <label className="grid gap-1.5"><span className="field-label">From snapshot</span><select className={input} value={periodStartId} onChange={(event) => setPeriodStartId(event.target.value)}>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{timestampLabel(snapshot.capturedAt)}</option>)}</select></label>
                      <label className="grid gap-1.5"><span className="field-label">To snapshot</span><select className={input} value={periodEndId} onChange={(event) => setPeriodEndId(event.target.value)}>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{timestampLabel(snapshot.capturedAt)}</option>)}</select></label>
                    </div>
                    {comparisonBusy && <p role="status" className="mt-4 text-sm text-muted-foreground">Calculating comparison…</p>}
                    {periodComparison && !comparisonBusy && <div className="mt-4 grid gap-2 text-sm">
                      <p>Known priced value change: <strong className="tabular-nums">{rupees(periodComparison.knownMarketValueChange)}</strong></p>
                      <p>Complete total value change: <strong className="tabular-nums">{periodComparison.totalMarketValueChange === null ? "Unavailable: at least one valuation is incomplete or stale" : rupees(periodComparison.totalMarketValueChange)}</strong></p>
                      <p>Realised P&amp;L change: <strong className="tabular-nums">{rupees(periodComparison.realizedPnlChange)}</strong></p>
                      <p>Known unrealised P&amp;L change: <strong className="tabular-nums">{rupees(periodComparison.knownUnrealizedPnlChange)}</strong></p>
                      <p className="text-xs leading-5 text-muted-foreground">Changes compare stored snapshot values. They are not time-weighted or money-weighted investment returns.</p>
                    </div>}
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-border p-4">
                  <h3 className="font-display font-semibold">Selected snapshot details</h3>
                  {snapshotBusy && <p role="status" className="mt-2 text-sm text-muted-foreground">Loading stored snapshot…</p>}
                  {!snapshotBusy && snapshotDetail && <>
                    <p className="mt-1 text-xs text-muted-foreground">Captured {timestampLabel(snapshotDetail.capturedAt)} · {snapshotDetail.valuationStatus === "COMPLETE" ? "complete valuation" : `${snapshotDetail.valuationStatus.toLowerCase()} valuation; ${snapshotDetail.missingPriceCount} missing and ${snapshotDetail.stalePriceCount} stale price(s)`}. Stored values are not recalculated from current prices.</p>
                    {snapshotDetail.holdings.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No active holdings were present in this snapshot.</p> : <div className="mt-3 overflow-x-auto"><table className="investment-table w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-3 py-2">Holding</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-right">Price used</th><th className="px-3 py-2 text-right">Market value</th><th className="px-3 py-2 text-right">Realised P&amp;L</th><th className="px-3 py-2 text-right">Unrealised P&amp;L</th></tr></thead><tbody>{snapshotDetail.holdings.map((holding) => <tr key={`${holding.exchange}:${holding.symbol}`} className="border-b border-border last:border-0"><th scope="row" className="px-3 py-3">{holding.symbol} <span className="text-xs text-muted-foreground">{holding.exchange}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{holding.priceStatus === "MISSING" ? "Missing price" : `${holding.priceStatus.toLowerCase()} · ${holding.priceSource} · ${holding.priceAsOf ? timestampLabel(holding.priceAsOf) : ""}`}</span></th><td className="px-3 py-3 text-right">{holding.quantity}</td><td className="px-3 py-3 text-right">{holding.price === null ? "—" : rupees(holding.price, 4)}</td><td className="px-3 py-3 text-right">{holding.marketValue === null ? "Unavailable" : rupees(holding.marketValue)}</td><td className="px-3 py-3 text-right">{rupees(holding.realizedPnl)}</td><td className="px-3 py-3 text-right">{holding.unrealizedPnl === null ? "Unavailable" : rupees(holding.unrealizedPnl)}</td></tr>)}</tbody></table></div>}
                  </>}
                </div>
              </>}
            </section>

            <section aria-labelledby="holdings-heading" className="investment-section">
              <div className="mb-4">
                <h2 id="holdings-heading" className="font-display mt-1 text-xl font-semibold">Holdings and valuation</h2>
                <p className="mt-1 text-sm text-muted-foreground">FIFO cost and realised P&amp;L come from recorded trades. Market values use only prices you enter below; no quote feed is connected.</p>
              </div>
              {loading && !data && <p role="status" className="py-4 text-sm text-muted-foreground">Loading portfolio…</p>}
              {data && data.portfolio.positions.length === 0 && <p className="py-5 text-sm text-muted-foreground">No active stock holdings. Record a completed buy trade to begin portfolio analytics.</p>}
              {!!data?.portfolio.positions.length && (
                <div className="overflow-x-auto">
                  <table className="investment-table w-full min-w-[1100px] text-left text-sm">
                    <thead><tr className="border-b border-border text-xs text-muted-foreground"><th scope="col" className="px-3 py-3 font-medium">Stock</th><th scope="col" className="px-3 py-3 text-right font-medium">Shares</th><th scope="col" className="px-3 py-3 text-right font-medium">Avg FIFO cost</th><th scope="col" className="px-3 py-3 text-right font-medium">Cost basis</th><th scope="col" className="px-3 py-3 text-right font-medium">Latest manual price</th><th scope="col" className="px-3 py-3 text-right font-medium">Market value</th><th scope="col" className="px-3 py-3 text-right font-medium">Unrealised P&amp;L</th><th scope="col" className="px-3 py-3 text-right font-medium">Realised P&amp;L</th><th scope="col" className="px-3 py-3 font-medium">Details / update</th></tr></thead>
                    <tbody>{data.portfolio.positions.map((holding) => {
                      const key = stockKey(holding.exchange, holding.symbol);
                      return <tr key={key} className="border-b border-border last:border-0 align-top">
                        <th scope="row" className="px-3 py-4 font-semibold">{holding.companyName ?? holding.symbol}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">{holding.symbol} · {holding.exchange}</span></th>
                        <td className="px-3 py-4 text-right tabular-nums">{holding.quantity.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-4 text-right tabular-nums">{rupees(holding.averageCostPerShare, 4)}</td>
                        <td className="px-3 py-4 text-right tabular-nums">{rupees(holding.costBasis)}</td>
                        <td className="px-3 py-4 text-right tabular-nums">{holding.price === null ? <span className="text-muted-foreground">No price entered</span> : <>{rupees(holding.price, 4)}<span className={`mt-1 block text-xs ${holding.priceStatus === "STALE" ? "text-warning" : "text-muted-foreground"}`}>{holding.priceStatus === "STALE" ? "Stale" : "User entered"}</span></>}</td>
                        <td className="px-3 py-4 text-right tabular-nums">{holding.marketValue === null ? "—" : rupees(holding.marketValue)}</td>
                        <td className={`px-3 py-4 text-right tabular-nums ${holding.unrealizedPnl === null ? "text-muted-foreground" : Number(holding.unrealizedPnl) >= 0 ? "text-gain" : "text-loss"}`}>{holding.unrealizedPnl === null ? "—" : rupees(holding.unrealizedPnl)}</td>
                        <td className={`px-3 py-4 text-right tabular-nums ${Number(holding.realizedPnl) >= 0 ? "text-gain" : "text-loss"}`}>{rupees(holding.realizedPnl)}</td>
                        <td className="px-3 py-3">
                          <details className="min-w-52">
                            <summary className="cursor-pointer text-xs font-semibold text-primary">{holding.price === null ? "Enter price" : "Update price"}</summary>
                            <form className="mt-2 grid gap-2" onSubmit={(event) => void submitPrice(event, holding)}>
                              <label className="grid gap-1"><span className="field-label">Latest price (₹ / share)</span><input className={input} name="price" type="number" min="0.000001" step="0.000001" value={priceInputs[key] ?? ""} onChange={(event) => setPriceInputs((current) => ({ ...current, [key]: event.target.value }))} required /></label>
                              {holding.priceAsOf && <span className="text-xs text-muted-foreground">{holding.priceSource ?? "User entered"} · {timestampLabel(holding.priceAsOf)}</span>}
                              <button className={secondaryButton} type="submit" disabled={saving}>{saving ? "Saving…" : "Save price"}</button>
                            </form>
                          </details>
                          <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Holding details</summary><div className="mt-2 space-y-1 text-xs text-muted-foreground"><p>FIFO average cost: {rupees(holding.averageCostPerShare, 4)} per share</p><p>FIFO cost basis: {rupees(holding.costBasis)}</p><p>Current allocation of priced holdings: {holding.currentAllocationPercent === null ? "Unavailable" : `${holding.currentAllocationPercent}%`}</p><p>Price source: {holding.priceSource ?? "None"}</p><p>Price as of: {holding.priceAsOf ? timestampLabel(holding.priceAsOf) : "No price entered"}</p></div></details>
                        </td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              )}
              {data && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-secondary/35 p-3"><p className="field-label">Realised P&amp;L</p><p className={`mt-1 font-display text-lg font-semibold ${Number(data.portfolio.summary.realizedPnl) >= 0 ? "text-gain" : "text-loss"}`}>{rupees(data.portfolio.summary.realizedPnl)}</p><p className="mt-1 text-xs text-muted-foreground">FIFO trade proceeds less fees and cost basis, including closed positions.</p></div>
                <div className="rounded-xl bg-secondary/35 p-3"><p className="field-label">Unrealised P&amp;L</p><p className="mt-1 font-display text-lg font-semibold">{data.portfolio.summary.totalUnrealizedPnl === null ? "Incomplete valuation" : rupees(data.portfolio.summary.totalUnrealizedPnl)}</p><p className="mt-1 text-xs text-muted-foreground">Known priced positions: {rupees(data.portfolio.summary.unrealizedPnlForPricedHoldings)}</p></div>
                <div className="rounded-xl bg-secondary/35 p-3"><p className="field-label">Largest holding</p><p className="mt-1 font-display text-lg font-semibold">{data.portfolio.largestHoldings[0]?.symbol ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">{data.portfolio.summary.topHoldingAllocationPercent === null ? "No priced holdings" : `${data.portfolio.summary.topHoldingAllocationPercent}% of priced holdings`}</p></div>
                <div className="rounded-xl bg-secondary/35 p-3"><p className="field-label">Top five concentration</p><p className="mt-1 font-display text-lg font-semibold">{data.portfolio.summary.topFiveAllocationPercent === null ? "—" : `${data.portfolio.summary.topFiveAllocationPercent}%`}</p><p className="mt-1 text-xs text-muted-foreground">Calculated from priced active holdings only.</p></div>
              </div>}
              {data && data.portfolio.realizedBySymbol.length > 0 && <div className="mt-4 rounded-xl border border-border p-4">
                <h3 className="font-display font-semibold">Realised P&amp;L by stock</h3>
                <p className="mt-1 text-xs text-muted-foreground">Includes active and fully closed FIFO positions.</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.portfolio.realizedBySymbol.map((item) => <li key={stockKey(item.exchange, item.symbol)} className="flex justify-between gap-3 rounded-lg bg-secondary/30 px-3 py-2 text-sm"><span>{item.symbol} <span className="text-xs text-muted-foreground">{item.exchange}</span></span><span className={`tabular-nums ${Number(item.realizedPnl) >= 0 ? "text-gain" : "text-loss"}`}>{rupees(item.realizedPnl)}</span></li>)}</ul>
              </div>}
            </section>

            {data && data.portfolio.positions.length > 0 && <>
              <section aria-labelledby="allocation-heading" className="investment-section">
                <div className="mb-4"><h2 id="allocation-heading" className="font-display mt-1 text-xl font-semibold">Current allocation</h2><p className="mt-1 text-sm text-muted-foreground">Bars show each priced holding as a share of the known priced market value. The percentages are partial if valuation is incomplete or stale.</p></div>
                <div className="space-y-3">{data.portfolio.positions.map((holding) => <div key={stockKey(holding.exchange, holding.symbol)}>
                  <div className="mb-1 flex justify-between gap-3 text-sm"><span className="font-medium">{holding.symbol} <span className="text-xs text-muted-foreground">{holding.exchange}</span></span><span className="text-muted-foreground">{holding.currentAllocationPercent === null ? "Unpriced" : `${holding.currentAllocationPercent}%`}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${holding.currentAllocationPercent ?? 0}%` }} /></div>
                </div>)}</div>
              </section>

              <section aria-labelledby="rebalance-heading" className="investment-section">
                <div className="mb-4"><h2 id="rebalance-heading" className="font-display mt-1 text-xl font-semibold">Target allocation comparison</h2><p className="mt-1 text-sm text-muted-foreground">Enter target percentages for these active stock holdings. This is an indicative comparison, not a recommendation; no trades are executed. Targets are not saved.</p></div>
                <form onSubmit={(event) => void calculateRebalance(event)}>
                  <div className="overflow-x-auto"><table className="investment-table w-full min-w-[700px] text-left text-sm">
                    <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-3 py-3 font-medium">Stock</th><th className="px-3 py-3 text-right font-medium">Current allocation</th><th className="px-3 py-3 text-right font-medium">Target (%)</th>{rebalance && <><th className="px-3 py-3 text-right font-medium">Deviation (pp)</th><th className="px-3 py-3 text-right font-medium">Estimated action</th></>}</tr></thead>
                    <tbody>{data.portfolio.positions.map((holding) => {
                      const key = stockKey(holding.exchange, holding.symbol);
                      const preview = rebalance?.lines.find((line) => line.exchange === holding.exchange && line.symbol === holding.symbol);
                      return <tr key={key} className="border-b border-border last:border-0"><th scope="row" className="px-3 py-3 font-medium">{holding.symbol} · {holding.exchange}</th><td className="px-3 py-3 text-right tabular-nums">{holding.currentAllocationPercent === null ? "Unavailable" : `${holding.currentAllocationPercent}%`}</td><td className="px-3 py-2 text-right"><input aria-label={`${holding.symbol} target allocation percent`} className={`${input} ml-auto max-w-28 text-right`} type="number" name={key} min="0" max="100" step="0.01" required value={targetInputs[key] ?? ""} onChange={(event) => { setTargetInputs((current) => ({ ...current, [key]: event.target.value })); setRebalance(null); }} /></td>{rebalance && <><td className="px-3 py-3 text-right tabular-nums">{preview?.deviationPercentagePoints ?? "—"}</td><td className="px-3 py-3 text-right tabular-nums">{preview ? <span className={preview.action === "BUY" ? "text-info" : preview.action === "SELL" ? "text-warning" : "text-muted-foreground"}>{preview.action === "HOLD" ? "Hold" : `${preview.action} · ${rupees(preview.estimatedTradeAmount)}`}</span> : "—"}</td></>}</tr>;
                    })}</tbody>
                  </table></div>
                  <div className="mt-3 flex flex-wrap items-center gap-3"><button className={button} type="submit" disabled={saving || data.portfolio.valuationStatus !== "COMPLETE"}>{saving ? "Calculating…" : "Compare target allocation"}</button><p className="text-xs text-muted-foreground">{data.portfolio.valuationStatus !== "COMPLETE" ? "A complete, current valuation is required for estimated trade amounts." : "Targets must total exactly 100%. The preview does not execute trades."}</p></div>
                  {rebalance && <p className="mt-3 rounded-lg border border-border bg-secondary/30 p-3 text-sm">Valued portfolio: {rupees(rebalance.totalMarketValue)} · Trade amounts are estimates based on manually entered current prices.</p>}
                </form>
              </section>
            </>}

            <section aria-labelledby="history-heading" className="investment-section investment-history">
              <div className="mb-3">
                <h2 id="history-heading" className="font-display mt-1 text-xl font-semibold">Transaction history</h2>
                <p className="mt-1 text-sm text-muted-foreground">Trades are immutable. Correct an entry by recording a reversal with a reason, then adding the replacement trade.</p>
              </div>
              {data?.trades.length === 0 && <p className="py-5 text-sm text-muted-foreground">No stock trades recorded yet.</p>}
              {!!data?.trades.length && <div>
                {data.trades.map((trade) => (
                  <article key={trade.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-display font-semibold"><span className={trade.side === "BUY" ? "text-info" : "text-warning"}>{trade.side}</span> · {trade.symbol} <span className="font-normal text-muted-foreground">({trade.exchange})</span></p>
                        <p className="mt-1 text-sm text-muted-foreground">{dateLabel(trade.tradeDate)} · {trade.quantity.toLocaleString("en-IN")} shares at {rupees(trade.executionPrice, 4)} · fees {rupees(trade.fees)}</p>
                        {trade.status === "REVERSAL" && <p className="mt-1 text-sm text-plum">Reversal entry · {trade.correctionReason}</p>}
                        {trade.status === "REVERSED" && <p className="mt-1 text-sm text-loss">Reversed · {trade.reversal?.correctionReason}</p>}
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

            <section aria-labelledby="legacy-heading" className="investment-section">
              <h2 id="legacy-heading" className="font-display mt-1 text-xl font-semibold">Existing investment records</h2>
              <p className="mt-1 text-sm text-muted-foreground">These older aggregate entries remain separate from the stock ledger and continue to feed existing finance overview totals. They are not converted because they have no stock quantity or exchange details.</p>
              {data?.legacy.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No existing aggregate records.</p>}
              {!!data?.legacy.length && <ul className="mt-4 divide-y divide-border">{data.legacy.map((record) => <li key={record.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{record.name} <span className="text-xs text-muted-foreground">· {record.category.replaceAll("_", " ").toLowerCase()}</span></span><span className="tabular-nums text-muted-foreground">Invested {rupees(record.investedAmount)} · stored value {rupees(record.currentValue)}</span></li>)}</ul>}
            </section>

            <p className="text-xs leading-5 text-muted-foreground">All prices are entered by you and can be stale. No live or delayed quote service, corporate actions, brokerage execution, tax-lot reporting, XIRR, time-weighted return, volatility, Sharpe ratio, drawdown or VaR/CVaR series is connected. FIFO figures are for recordkeeping and are not tax advice.</p>
          </div>
      </div>
    </AuthenticatedShell>
  );
}
