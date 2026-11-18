export type Allocation = { equity: number; debt: number; gold: number };
export type AssetKey = keyof Allocation;
export type CorrelationMatrix = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
export type ProjectionPoint = {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  expected: number;
  band: number;
};

export type SimulationOptions = {
  allocation: Allocation;
  years: number;
  monthlySip: number;
  simulations?: number;
  seed?: number | string;
  random?: () => number;
  correlationMatrix?: CorrelationMatrix;
  assetAssumptions?: ReadonlyArray<{ key: AssetKey; label: string; cagr: number; volatility: number }>;
};

export type SimulationResult = {
  projection: ProjectionPoint[];
  statistics: {
    simulations: number;
    seed: number | string | null;
    totalInvestedCapital: number;
    expectedFinalValue: number;
    expectedGains: number;
    probabilityBelowInvestedCapital: number;
    /** Worst per-path peak-to-trough decline, measured on post-contribution account balances. */
    maximumDrawdown: number;
    /** Arithmetic mean of each simulated path's maximum drawdown. */
    averageMaximumDrawdown: number;
  };
  finalValues: number[];
};

export const ASSET_ASSUMPTIONS: ReadonlyArray<{ key: AssetKey; label: string; cagr: number; volatility: number }> = [
  { key: "equity", label: "Equity", cagr: 0.12, volatility: 0.15 },
  { key: "debt", label: "Debt", cagr: 0.07, volatility: 0.03 },
  { key: "gold", label: "Gold", cagr: 0.08, volatility: 0.10 },
];

/** Default identity matrix means zero cross-asset correlation; it is not a historical estimate. */
export const DEFAULT_CORRELATION_MATRIX: CorrelationMatrix = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export const MIN_SIMULATIONS = 100;
export const MAX_SIMULATIONS = 10_000;
export const MAX_HORIZON_YEARS = 40;
export const MAX_PATH_MONTHS = 1_000_000;

const assetKeys: AssetKey[] = ["equity", "debt", "gold"];
const MAX_LOG = Math.log(Number.MAX_VALUE);

export function createSeededRandom(seed: number | string): () => number {
  if (typeof seed === "number" && !Number.isSafeInteger(seed)) throw new RangeError("Numeric seed must be a safe integer");
  let state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  return () => {
    // Mulberry32: small, deterministic PRNG for reproducible simulations (not cryptographic use).
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function validateInputs(options: SimulationOptions): { weights: number[]; months: number; simulations: number; invested: number; matrix: CorrelationMatrix; assumptions: ReadonlyArray<{ key: AssetKey; label: string; cagr: number; volatility: number }> } {
  const { allocation, years, monthlySip } = options;
  if (!allocation || typeof allocation !== "object") throw new RangeError("allocation is required");
  const percentages = assetKeys.map((key) => allocation[key]);
  if (percentages.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
    throw new RangeError("Allocation weights must be finite percentages from 0 to 100");
  }
  const totalWeight = percentages.reduce((sum, value) => sum + value, 0);
  if (Math.abs(totalWeight - 100) > 1e-8) throw new RangeError("Allocation weights must total 100%");
  if (!Number.isSafeInteger(years) || years < 1 || years > MAX_HORIZON_YEARS) throw new RangeError(`years must be an integer from 1 to ${MAX_HORIZON_YEARS}`);
  if (!Number.isFinite(monthlySip) || monthlySip < 0) throw new RangeError("monthlySip must be finite and non-negative");
  const simulations = options.simulations ?? 1000;
  if (!Number.isSafeInteger(simulations) || simulations < MIN_SIMULATIONS || simulations > MAX_SIMULATIONS) {
    throw new RangeError(`simulations must be an integer from ${MIN_SIMULATIONS} to ${MAX_SIMULATIONS}`);
  }
  const months = years * 12;
  if (simulations * months > MAX_PATH_MONTHS) throw new RangeError(`simulations × months cannot exceed ${MAX_PATH_MONTHS}`);
  const invested = monthlySip * months;
  if (!Number.isFinite(invested)) throw new RangeError("Total invested capital exceeds the supported numeric range");
  const matrix = options.correlationMatrix ?? DEFAULT_CORRELATION_MATRIX;
  validateCorrelationMatrix(matrix);
  const assumptions = options.assetAssumptions ?? ASSET_ASSUMPTIONS;
  if (assumptions.length !== 3 || assumptions.some((asset, index) => asset.key !== assetKeys[index]
    || !Number.isFinite(asset.cagr) || asset.cagr <= -1
    || !Number.isFinite(asset.volatility) || asset.volatility < 0)) {
    throw new RangeError("Provide finite return assumptions for equity, debt and gold; CAGR must exceed -100% and volatility must be non-negative");
  }
  if (options.seed === undefined && options.random === undefined) throw new RangeError("Provide a reproducible seed or an injected random source");
  if (options.seed !== undefined && typeof options.seed === "number" && !Number.isSafeInteger(options.seed)) throw new RangeError("Numeric seed must be a safe integer");
  if (typeof options.seed === "string" && !options.seed.trim()) throw new RangeError("Simulation seed cannot be empty");
  const weights = percentages.map((value) => value / 100);
  return { weights, months, simulations, invested, matrix, assumptions };
}

/** Validate 3×3 correlation structure and positive semidefiniteness with a Cholesky factor. */
export function choleskyCorrelation(matrix: CorrelationMatrix): number[][] {
  validateCorrelationMatrixShape(matrix);
  const tolerance = 1e-10;
  for (let row = 0; row < 3; row += 1) {
    if (!Number.isFinite(matrix[row][row]) || Math.abs(matrix[row][row] - 1) > tolerance) throw new RangeError("Correlation matrix diagonal must be 1");
    for (let column = 0; column < 3; column += 1) {
      const value = matrix[row][column];
      if (!Number.isFinite(value) || value < -1 || value > 1) throw new RangeError("Correlations must be finite and between -1 and 1");
      if (Math.abs(value - matrix[column][row]) > tolerance) throw new RangeError("Correlation matrix must be symmetric");
    }
  }

  const lower = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let remainder = matrix[row][column];
      for (let k = 0; k < column; k += 1) remainder -= lower[row][k] * lower[column][k];
      if (row === column) {
        if (remainder < -tolerance) throw new RangeError("Correlation matrix must be positive semidefinite");
        lower[row][column] = Math.sqrt(Math.max(0, remainder));
      } else if (lower[column][column] > tolerance) {
        lower[row][column] = remainder / lower[column][column];
      } else if (Math.abs(remainder) > tolerance) {
        throw new RangeError("Correlation matrix must be positive semidefinite");
      }
    }
  }
  return lower;
}

function validateCorrelationMatrix(matrix: CorrelationMatrix): void {
  choleskyCorrelation(matrix);
}

function validateCorrelationMatrixShape(matrix: CorrelationMatrix): void {
  if (!Array.isArray(matrix) || matrix.length !== 3 || matrix.some((row) => !Array.isArray(row) || row.length !== 3)) {
    throw new RangeError("Correlation matrix must be 3×3 for equity, debt and gold");
  }
}

function standardNormals(random: () => number): number[] {
  const sampleUniform = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("Random source must return finite values in [0, 1)");
    return Math.max(value, Number.EPSILON);
  };
  const first = sampleUniform();
  const second = sampleUniform();
  const third = sampleUniform();
  const fourth = sampleUniform();
  const radiusA = Math.sqrt(-2 * Math.log(first));
  const angleA = 2 * Math.PI * second;
  const radiusB = Math.sqrt(-2 * Math.log(third));
  const angleB = 2 * Math.PI * fourth;
  return [radiusA * Math.cos(angleA), radiusA * Math.sin(angleA), radiusB * Math.cos(angleB)];
}

/** Apply the Cholesky factor to independent standard normal draws. */
export function correlateStandardNormals(independent: readonly number[], matrix: CorrelationMatrix): number[] {
  if (independent.length !== 3 || independent.some((value) => !Number.isFinite(value))) throw new RangeError("Exactly three finite independent normal draws are required");
  const lower = choleskyCorrelation(matrix);
  return lower.map((row) => row.reduce((sum, value, index) => sum + value * independent[index], 0));
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/** Maximum peak-to-trough drawdown over a balance series. Balance values must be finite/nonnegative. */
export function calculateMaximumDrawdown(values: readonly number[]): number {
  let peak = 0;
  let maximum = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError("Balance series must contain finite non-negative values");
    peak = Math.max(peak, value);
    if (peak > 0) maximum = Math.max(maximum, (peak - value) / peak);
  }
  return maximum;
}

function safeBalanceUpdate(balance: number, grossReturn: number, contribution: number): number {
  if (!Number.isFinite(grossReturn) || grossReturn < 0) throw new RangeError("Portfolio gross return must be finite and non-negative");
  const grownBalance = balance * grossReturn;
  if (!Number.isFinite(grownBalance) || !Number.isFinite(grownBalance + contribution)) throw new RangeError("Portfolio value exceeded the supported numeric range");
  return grownBalance + contribution;
}

/**
 * Simulate fixed-weight monthly rebalanced portfolios using annual lognormal return assumptions.
 * Contributions are added at month end and therefore receive no return for their contribution month.
 * Conditional percentiles are simulated outcomes, not confidence intervals or guarantees.
 */
export function simulatePortfolio(options: SimulationOptions): SimulationResult {
  const { weights, months, simulations, invested, matrix, assumptions } = validateInputs(options);
  const seed = options.random ? null : options.seed!;
  const random = options.random ?? createSeededRandom(options.seed!);
  const lower = choleskyCorrelation(matrix);
  const weightTotal = weights[0] + weights[1] + weights[2];
  const yearlyValues = Array.from({ length: options.years + 1 }, () => new Array<number>(simulations));
  const finalValues = new Array<number>(simulations);
  const pathDrawdowns = new Array<number>(simulations);

  for (let pathIndex = 0; pathIndex < simulations; pathIndex += 1) {
    let balance = 0;
    let peak = 0;
    let maximumDrawdown = 0;
    yearlyValues[0][pathIndex] = 0;
    for (let month = 1; month <= months; month += 1) {
      const independent = standardNormals(random);
      const normals = lower.map((row) => row.reduce((sum, value, index) => sum + value * independent[index], 0));
      let grossPortfolioReturn = 0;
      for (let assetIndex = 0; assetIndex < assumptions.length; assetIndex += 1) {
        const asset = assumptions[assetIndex];
        const logDrift = (Math.log1p(asset.cagr) - (asset.volatility * asset.volatility) / 2) / 12;
        const logReturn = logDrift + (asset.volatility / Math.sqrt(12)) * normals[assetIndex];
        if (!Number.isFinite(logReturn) || logReturn > MAX_LOG) throw new RangeError("Sampled asset return exceeded the supported numeric range");
        const grossAssetReturn = Math.exp(logReturn);
        grossPortfolioReturn += weights[assetIndex] * grossAssetReturn;
      }
      balance = safeBalanceUpdate(balance, grossPortfolioReturn / weightTotal, options.monthlySip);
      peak = Math.max(peak, balance);
      if (peak > 0) maximumDrawdown = Math.max(maximumDrawdown, (peak - balance) / peak);
      if (month % 12 === 0) yearlyValues[month / 12][pathIndex] = balance;
    }
    finalValues[pathIndex] = balance;
    pathDrawdowns[pathIndex] = maximumDrawdown;
  }

  const projection = yearlyValues.map((yearValues, year) => {
    const sorted = [...yearValues].sort((a, b) => a - b);
    const p10 = percentile(sorted, 0.1);
    const p25 = percentile(sorted, 0.25);
    const p50 = percentile(sorted, 0.5);
    const p75 = percentile(sorted, 0.75);
    const p90 = percentile(sorted, 0.9);
    const expected = sorted.reduce((sum, value) => sum + value / sorted.length, 0);
    return { year, p10, p25, p50, p75, p90, expected, band: p90 - p10 };
  });
  const expectedFinalValue = projection[projection.length - 1].expected;
  const probabilityBelowInvestedCapital = finalValues.filter((value) => value < invested).length / simulations;
  const averageMaximumDrawdown = pathDrawdowns.reduce((sum, value) => sum + value / simulations, 0);
  return {
    projection,
    statistics: {
      simulations,
      seed,
      totalInvestedCapital: invested,
      expectedFinalValue,
      expectedGains: expectedFinalValue - invested,
      probabilityBelowInvestedCapital,
      maximumDrawdown: Math.max(...pathDrawdowns),
      averageMaximumDrawdown,
    },
    finalValues,
  };
}
