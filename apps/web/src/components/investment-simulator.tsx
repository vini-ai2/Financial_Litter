import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  ASSET_ASSUMPTIONS,
  DEFAULT_CORRELATION_MATRIX,
  MAX_HORIZON_YEARS,
  MAX_PATH_MONTHS,
  MAX_SIMULATIONS,
  MIN_SIMULATIONS,
  simulatePortfolio,
  type Allocation,
  type CorrelationMatrix,
  type SimulationResult,
} from "@/lib/investment-simulation";

const initialAllocation: Allocation = { equity: 60, debt: 30, gold: 10 };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const compactMoney = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 }).format(value);
const percentage = (value: number) => new Intl.NumberFormat("en-IN", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
const ASSET_KEYS = ["equity", "debt", "gold"] as const;
const CORRELATION_PAIRS = [
  { left: 0, right: 1, label: "Equity / debt" },
  { left: 0, right: 2, label: "Equity / gold" },
  { left: 1, right: 2, label: "Debt / gold" },
] as const;

function rebalance(allocation: Allocation, key: keyof Allocation, value: number): Allocation {
  const others = (Object.keys(allocation) as (keyof Allocation)[]).filter((item) => item !== key);
  const remaining = 100 - value;
  const otherTotal = allocation[others[0]] + allocation[others[1]];
  const firstShare = otherTotal === 0 ? remaining / 2 : remaining * allocation[others[0]] / otherTotal;
  return { ...allocation, [key]: value, [others[0]]: firstShare, [others[1]]: remaining - firstShare };
}

function withPairCorrelation(matrix: CorrelationMatrix, left: number, right: number, value: number): CorrelationMatrix {
  const next = matrix.map((row) => [...row]) as number[][];
  next[left][right] = value;
  next[right][left] = value;
  return next as unknown as CorrelationMatrix;
}

function generateSeed() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) return crypto.getRandomValues(new Uint32Array(1))[0].toString();
  return `${Date.now()}`;
}

export function InvestmentSimulator() {
  const [allocation, setAllocation] = useState(initialAllocation);
  const [years, setYears] = useState(10);
  const [monthlySip, setMonthlySip] = useState(10000);
  const [simulations, setSimulations] = useState(1000);
  const [seed, setSeed] = useState("20261118");
  const [correlationMatrix, setCorrelationMatrix] = useState<CorrelationMatrix>(DEFAULT_CORRELATION_MATRIX);
  const maxAllowedSimulations = Math.max(MIN_SIMULATIONS, Math.min(MAX_SIMULATIONS, Math.floor(MAX_PATH_MONTHS / (years * 12))));
  const model = useMemo(() => {
    try {
      return { result: simulatePortfolio({ allocation, years, monthlySip, simulations, seed, correlationMatrix }), error: "" };
    } catch (reason) {
      return { result: null, error: reason instanceof Error ? reason.message : "Could not run this simulation." };
    }
  }, [allocation, correlationMatrix, monthlySip, seed, simulations, years]);
  const result = model.result;
  const final = result?.projection[result.projection.length - 1];

  return (
    <section className="projection-section" aria-labelledby="simulator-title">
      <div className="mb-4">
        <h2 id="simulator-title" className="font-display text-xl font-semibold">Investment projection</h2>
        <p className="mt-1 text-sm text-muted-foreground">A reproducible Monte Carlo scenario explorer. Percentiles are simulated outcomes conditional on the model, not confidence intervals or guaranteed outcomes.</p>
      </div>

      {model.error ? <div className="mb-4 rounded-xl border border-loss/40 bg-loss/5 p-3 text-sm text-loss" role="alert">Simulation unavailable: {model.error}</div> : null}

      {result && final ? <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(["p10", "p25", "p50", "p75", "p90"] as const).map((key) => (
            <div key={key} className={`projection-outcome ${key === "p50" ? "border border-primary/40" : ""}`}>
              <p className="field-label">P{key.slice(1)}{key === "p50" ? " · Median" : ""}</p>
              <p className="font-display mt-2 text-sm font-semibold sm:text-base">{money(final[key])}</p>
            </div>
          ))}
        </div>

        <div className="projection-preview mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={result.projection} margin={{ top: 12, right: 8, left: 0, bottom: 2 }}>
              <defs><linearGradient id="percentileBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.025} /></linearGradient></defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(year) => year === 0 ? "Now" : `Year ${year}`} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} width={58} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={compactMoney} />
              <Tooltip formatter={(value, name) => [money(Number(value)), String(name)]} labelFormatter={(year) => Number(year) === 0 ? "Today" : `Year ${year}`} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend />
              <Area type="monotone" dataKey="p10" stackId="range" stroke="transparent" fill="transparent" name="P10" isAnimationActive={false} />
              <Area type="monotone" dataKey="band" stackId="range" stroke="none" fill="url(#percentileBand)" name="P10–P90 range" isAnimationActive={false} />
              <Line type="monotone" dataKey="p25" stroke="var(--chart-2)" strokeDasharray="4 3" dot={false} name="P25" isAnimationActive={false} />
              <Line type="monotone" dataKey="p50" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} name="P50 median" isAnimationActive={false} />
              <Line type="monotone" dataKey="p75" stroke="var(--chart-2)" strokeDasharray="4 3" dot={false} name="P75" isAnimationActive={false} />
              <Line type="monotone" dataKey="p90" stroke="var(--chart-1)" strokeDasharray="2 3" dot={false} name="P90" isAnimationActive={false} />
              <Line type="monotone" dataKey="expected" stroke="var(--foreground)" strokeDasharray="6 4" dot={false} name="Expected value" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Year-end simulated portfolio value · monthly deposits are added at month end.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Statistic label="Total invested" value={money(result.statistics.totalInvestedCapital)} />
          <Statistic label="Expected final value" value={money(result.statistics.expectedFinalValue)} />
          <Statistic label="Expected gain" value={money(result.statistics.expectedGains)} />
          <Statistic label="Ending below invested capital" value={percentage(result.statistics.probabilityBelowInvestedCapital)} />
          <Statistic label="Worst maximum drawdown" value={percentage(result.statistics.maximumDrawdown)} detail="Largest peak-to-trough decline observed across paths" />
          <Statistic label="Average path maximum drawdown" value={percentage(result.statistics.averageMaximumDrawdown)} />
        </div>
      </> : <div className="projection-outcome mt-4 py-5 text-sm text-muted-foreground" role="status">Waiting for a valid simulation configuration.</div>}

      <details className="projection-settings mt-5" open>
        <summary className="cursor-pointer font-ui text-sm font-medium">Simulation inputs and model assumptions</summary>
        <div className="projection-settings__body grid gap-6 pt-4 lg:grid-cols-2">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Asset allocation <span className="text-xs font-normal text-muted-foreground">(totals 100%)</span></h3>
            {ASSET_ASSUMPTIONS.map((asset) => {
              const key = asset.key;
              return <label key={key} className="block space-y-1.5">
                <span className="flex justify-between text-xs"><span>{asset.label} <span className="text-muted-foreground">{(asset.cagr * 100).toFixed(0)}% annual return · {(asset.volatility * 100).toFixed(0)}% volatility</span></span><b>{Math.round(allocation[key])}%</b></span>
                <input aria-label={`${asset.label} allocation`} className="w-full accent-[var(--primary)]" type="range" min="0" max="100" step="1" value={Math.round(allocation[key])} onChange={(event) => setAllocation((current) => rebalance(current, key, Number(event.target.value)))} />
              </label>;
            })}
          </div>

          <div className="grid content-start gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className="field-label">Investment horizon (years)</span><input aria-label="Investment horizon (years)" className="field-input" type="number" min="1" max={MAX_HORIZON_YEARS} step="1" value={years} onChange={(event) => {
              const nextYears = Math.min(MAX_HORIZON_YEARS, Math.max(1, Number(event.target.value) || 1));
              setYears(nextYears);
              const nextMax = Math.max(MIN_SIMULATIONS, Math.min(MAX_SIMULATIONS, Math.floor(MAX_PATH_MONTHS / (nextYears * 12))));
              setSimulations((current) => Math.min(current, nextMax));
            }} /></label>
            <label className="grid gap-1.5"><span className="field-label">Monthly SIP amount (₹)</span><input aria-label="Monthly SIP amount" className="field-input" type="number" min="0" max="10000000" step="500" value={monthlySip} onChange={(event) => setMonthlySip(Math.min(10000000, Math.max(0, Number(event.target.value) || 0)))} /></label>
            <label className="grid gap-1.5 sm:col-span-2"><span className="field-label">Simulation count: {simulations.toLocaleString("en-IN")}</span><input aria-label="Simulation count" className="w-full accent-[var(--primary)]" type="range" min={MIN_SIMULATIONS} max={maxAllowedSimulations} step="100" value={simulations} onChange={(event) => setSimulations(Number(event.target.value))} /><span className="text-xs text-muted-foreground">{MIN_SIMULATIONS.toLocaleString("en-IN")}–{maxAllowedSimulations.toLocaleString("en-IN")} paths · capped at {MAX_PATH_MONTHS.toLocaleString("en-IN")} path-months</span></label>
            <div className="grid gap-1.5 sm:col-span-2"><label className="field-label" htmlFor="simulation-seed">Random seed</label><div className="flex gap-2"><input id="simulation-seed" aria-label="Random seed" className="field-input min-w-0 flex-1" value={seed} onChange={(event) => setSeed(event.target.value)} /><button type="button" className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs font-semibold" onClick={() => setSeed(generateSeed())}>New seed</button></div><span className="text-xs text-muted-foreground">Reuse this seed and the same inputs to reproduce a run.</span></div>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <h3 className="text-sm font-semibold">Pairwise asset correlations</h3>
            <p className="text-xs text-muted-foreground">Default is zero correlation for each pair; this is an illustrative assumption, not a historical estimate. These correlations apply to the Gaussian log-return shocks. Some combinations are mathematically invalid and will be rejected.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {CORRELATION_PAIRS.map(({ left, right, label }) => <label key={label} className="grid gap-1.5">
                <span className="flex justify-between text-xs"><span>{label}</span><b>{correlationMatrix[left][right].toFixed(1)}</b></span>
                <input aria-label={`${label} correlation`} className="w-full accent-[var(--primary)]" type="range" min="-1" max="1" step="0.1" value={correlationMatrix[left][right]} onChange={(event) => setCorrelationMatrix((current) => withPairCorrelation(current, left, right, Number(event.target.value)))} />
              </label>)}
            </div>
            <p className="text-xs text-muted-foreground">Current matrix rows/columns: equity, debt, gold. Annual expected arithmetic returns and volatilities are converted to monthly lognormal returns. The allocation is reset monthly to target weights. Drawdown uses account balance after month-end contributions. Daily prices, taxes, fees, inflation, contribution escalation and historical calibration are not modeled.</p>
          </div>
        </div>
      </details>
      {result ? <p className="mt-3 text-xs text-muted-foreground">Run seed: {String(result.statistics.seed)} · {result.statistics.simulations.toLocaleString("en-IN")} simulated paths.</p> : null}
    </section>
  );
}

function Statistic({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-xl bg-secondary/35 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-base font-semibold tabular-nums">{value}</p>{detail ? <p className="mt-1 text-[0.7rem] leading-4 text-muted-foreground">{detail}</p> : null}</div>;
}
