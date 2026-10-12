import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { simulatePortfolio, type Allocation } from "@/lib/investment-simulation";

const initialAllocation: Allocation = { equity: 60, debt: 30, gold: 10 };
const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(value);
const compactMoney = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1,
}).format(value);

function rebalance(allocation: Allocation, key: keyof Allocation, value: number): Allocation {
  const others = (Object.keys(allocation) as (keyof Allocation)[]).filter((item) => item !== key);
  const remaining = 100 - value;
  const otherTotal = allocation[others[0]] + allocation[others[1]];
  const firstShare = otherTotal === 0 ? remaining / 2 : remaining * allocation[others[0]] / otherTotal;
  return { ...allocation, [key]: value, [others[0]]: firstShare, [others[1]]: remaining - firstShare };
}

export function InvestmentSimulator() {
  const [allocation, setAllocation] = useState(initialAllocation);
  const [years, setYears] = useState(10);
  const [monthlySip, setMonthlySip] = useState(10000);
  const projection = useMemo(
    () => simulatePortfolio(allocation, years, monthlySip),
    [allocation, years, monthlySip],
  );
  const final = projection[projection.length - 1];

  return (
    <section className="glass-card rounded-3xl p-5 sm:p-6" aria-labelledby="simulator-title">
      <div className="mb-5">
        <p className="field-label">Explore possible outcomes</p>
        <h2 id="simulator-title" className="font-display mt-1 text-xl font-bold">Investment simulator</h2>
        <p className="mt-1 text-xs text-muted-foreground">1,000 simulated paths · monthly SIP · assumptions are annual CAGR ± volatility</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-5">
          <div className="space-y-4 rounded-2xl border border-border bg-secondary/20 p-4">
            <h3 className="text-sm font-semibold">Portfolio allocation <span className="text-xs font-normal text-muted-foreground">(always totals 100%)</span></h3>
            {([
              ["equity", "Equity", "12% ± 15%"],
              ["debt", "Debt", "7% ± 3%"],
              ["gold", "Gold", "8% ± 10%"],
            ] as [keyof Allocation, string, string][]).map(([key, label, assumption]) => (
              <label key={key} className="block space-y-1.5">
                <span className="flex justify-between text-xs"><span>{label} <span className="text-muted-foreground">{assumption}</span></span><b>{Math.round(allocation[key])}%</b></span>
                <input
                  aria-label={`${label} allocation`}
                  className="w-full accent-[var(--primary)]"
                  type="range" min="0" max="100" step="1" value={Math.round(allocation[key])}
                  onChange={(event) => setAllocation((current) => rebalance(current, key, Number(event.target.value)))}
                />
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label className="grid gap-1.5"><span className="field-label">Investment horizon (years)</span><input className="field-input" type="number" min="1" max="40" step="1" value={years} onChange={(event) => setYears(Math.min(40, Math.max(1, Number(event.target.value) || 1)))} /></label>
            <label className="grid gap-1.5"><span className="field-label">Monthly SIP amount (₹)</span><input className="field-input" type="number" min="0" max="10000000" step="500" value={monthlySip} onChange={(event) => setMonthlySip(Math.min(10000000, Math.max(0, Number(event.target.value) || 0)))} /></label>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">These are illustrative scenarios based on fixed assumptions. Real returns can differ substantially; results are not guaranteed or financial advice.</p>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[["P10", final.p10, "Lower scenario"], ["P50", final.p50, "Median scenario"], ["P90", final.p90, "Upper scenario"]].map(([label, value, description]) => (
              <div key={String(label)} className="rounded-2xl border border-border bg-secondary/20 p-3">
                <p className="field-label">{label} · {description}</p><p className="font-display mt-2 text-sm font-bold sm:text-lg">{money(Number(value))}</p>
              </div>
            ))}
          </div>
          <div className="h-72 w-full rounded-2xl border border-border bg-secondary/10 p-2 sm:p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projection} margin={{ top: 12, right: 8, left: 0, bottom: 2 }}>
                <defs><linearGradient id="percentileBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.04} /></linearGradient></defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(year) => year === 0 ? "Now" : `Year ${year}`} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={58} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={compactMoney} />
                <Tooltip formatter={(value, name) => [money(Number(value)), name === "band" ? "P10–P90 range" : String(name)]} labelFormatter={(year) => Number(year) === 0 ? "Today" : `Year ${year}`} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                <Area type="monotone" dataKey="p10" stackId="range" stroke="transparent" fill="transparent" name="P10" isAnimationActive={false} />
                <Area type="monotone" dataKey="band" stackId="range" stroke="none" fill="url(#percentileBand)" name="band" isAnimationActive={false} />
                <Area type="monotone" dataKey="p50" stroke="var(--primary)" strokeWidth={2.5} fill="none" name="P50 median" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span><i className="mr-1.5 inline-block size-2 rounded-full bg-[var(--chart-2)]" />P10–P90 range</span><span><i className="mr-1.5 inline-block size-2 rounded-full bg-primary" />P50 median</span><span>Values shown at year-end</span></div>
        </div>
      </div>
    </section>
  );
}
