export type Allocation = { equity: number; debt: number; gold: number };
export type ProjectionPoint = { year: number; p10: number; p50: number; p90: number; band: number };

const ASSETS = [
  { key: "equity", cagr: 0.12, volatility: 0.15 },
  { key: "debt", cagr: 0.07, volatility: 0.03 },
  { key: "gold", cagr: 0.08, volatility: 0.10 },
] as const;

function normalSample() {
  const u = Math.max(Number.EPSILON, Math.random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function percentile(sorted: number[], fraction: number) {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/** Simulate 1,000 monthly-contribution paths using annual CAGR and volatility assumptions. */
export function simulatePortfolio(allocation: Allocation, years: number, monthlySip: number): ProjectionPoint[] {
  const weights = [allocation.equity, allocation.debt, allocation.gold].map((value) => value / 100);
  const months = years * 12;
  const paths = Array.from({ length: 1000 }, () => ({ value: 0, yearly: [0] as number[] }));

  for (let month = 1; month <= months; month++) {
    for (const path of paths) {
      let portfolioReturn = 0;
      ASSETS.forEach((asset, index) => {
        const sigma = asset.volatility;
        const logDrift = Math.log1p(asset.cagr) - (sigma * sigma) / 2;
        const assetReturn = Math.exp(logDrift / 12 + (sigma / Math.sqrt(12)) * normalSample()) - 1;
        portfolioReturn += weights[index] * assetReturn;
      });
      path.value = path.value * (1 + portfolioReturn) + monthlySip;
      if (month % 12 === 0) path.yearly.push(path.value);
    }
  }

  return Array.from({ length: years + 1 }, (_, year) => {
    const values = paths.map((path) => path.yearly[year]).sort((a, b) => a - b);
    const p10 = percentile(values, 0.1);
    const p50 = percentile(values, 0.5);
    const p90 = percentile(values, 0.9);
    return { year, p10, p50, p90, band: p90 - p10 };
  });
}
