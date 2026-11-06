import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { simulatePortfolio, type Allocation } from "@/lib/investment-simulation";

const initialAllocation: Allocation = { equity: 60, debt: 30, gold: 10 };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const compactMoney = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 }).format(value);

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
  const projection = useMemo(() => simulatePortfolio(allocation, years, monthlySip), [allocation, years, monthlySip]);
  const final = projection[projection.length - 1];

  return (
    <section className="projection-section" aria-labelledby="simulator-title">
      <div className="mb-4">
        <h2 id="simulator-title" className="font-display text-xl font-semibold">Investment projection</h2>
        <p className="mt-1 text-sm text-muted-foreground">1,000 simulated paths using monthly SIP contributions and fixed growth and volatility assumptions.</p>
      </div>

      <div className="projection-outcomes grid grid-cols-3 gap-2 sm:gap-3">
        {[["P10", final.p10, "Lower"], ["P50", final.p50, "Median"], ["P90", final.p90, "Upper"]].map(([label, value, description]) => (
          <div key={String(label)} className="projection-outcome">
            <p className="field-label">{label} · {description}</p>
            <p className="font-display mt-2 text-sm font-semibold sm:text-lg">{money(Number(value))}</p>
          </div>
        ))}
      </div>

      <div className="projection-preview">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={projection} margin={{ top: 12, right: 8, left: 0, bottom: 2 }}>
            <defs><linearGradient id="percentileBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.025} /></linearGradient></defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(year) => year === 0 ? "Now" : `Year ${year}`} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={58} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={compactMoney} />
            <Tooltip formatter={(value, name) => [money(Number(value)), name === "band" ? "P10–P90 range" : String(name)]} labelFormatter={(year) => Number(year) === 0 ? "Today" : `Year ${year}`} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
            <Area type="monotone" dataKey="p10" stackId="range" stroke="transparent" fill="transparent" name="P10" isAnimationActive={false} />
            <Area type="monotone" dataKey="band" stackId="range" stroke="none" fill="url(#percentileBand)" name="band" isAnimationActive={false} />
            <Area type="monotone" dataKey="p50" stroke="var(--chart-3)" strokeWidth={2.5} fill="none" name="P50 median" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground"><span><i className="mr-1.5 inline-block size-2 rounded-full bg-[var(--chart-1)]" />P10–P90 range</span><span><i className="mr-1.5 inline-block size-2 rounded-full bg-[var(--chart-3)]" />P50 median</span><span>Values shown at year-end</span></div>

      <details className="projection-settings">
        <summary className="cursor-pointer font-ui text-sm font-medium">Adjust projection assumptions</summary>
        <div className="projection-settings__body grid gap-5 pt-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Portfolio allocation <span className="text-xs font-normal text-muted-foreground">(totals 100%)</span></h3>
            {([
              ["equity", "Equity", "12% ± 15%"],
              ["debt", "Debt", "7% ± 3%"],
              ["gold", "Gold", "8% ± 10%"],
            ] as [keyof Allocation, string, string][]).map(([key, label, assumption]) => (
              <label key={key} className="block space-y-1.5">
                <span className="flex justify-between text-xs"><span>{label} <span className="text-muted-foreground">{assumption}</span></span><b>{Math.round(allocation[key])}%</b></span>
                <input aria-label={`${label} allocation`} className="w-full accent-[var(--primary)]" type="range" min="0" max="100" step="1" value={Math.round(allocation[key])} onChange={(event) => setAllocation((current) => rebalance(current, key, Number(event.target.value)))} />
              </label>
            ))}
          </div>
          <div className="grid content-start gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className="field-label">Investment horizon (years)</span><input className="field-input" type="number" min="1" max="40" step="1" value={years} onChange={(event) => setYears(Math.min(40, Math.max(1, Number(event.target.value) || 1)))} /></label>
            <label className="grid gap-1.5"><span className="field-label">Monthly SIP amount (₹)</span><input className="field-input" type="number" min="0" max="10000000" step="500" value={monthlySip} onChange={(event) => setMonthlySip(Math.min(10000000, Math.max(0, Number(event.target.value) || 0)))} /></label>
          </div>
        </div>
        <p className="mt-4 max-w-4xl text-xs leading-relaxed text-muted-foreground">These are illustrative scenarios based on fixed assumptions. Real returns can differ substantially; results are not guaranteed or financial advice.</p>
      </details>
    </section>
  );
}
