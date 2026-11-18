import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSET_ASSUMPTIONS,
  choleskyCorrelation,
  correlateStandardNormals,
  createSeededRandom,
  DEFAULT_CORRELATION_MATRIX,
  MAX_HORIZON_YEARS,
  MAX_SIMULATIONS,
  MIN_SIMULATIONS,
  calculateMaximumDrawdown,
  simulatePortfolio,
  type Allocation,
  type CorrelationMatrix,
} from "../lib/investment-simulation";

const mixed: Allocation = { equity: 60, debt: 30, gold: 10 };
const deterministicZeroReturns = ASSET_ASSUMPTIONS.map((asset) => ({ ...asset, cagr: 0, volatility: 0 }));

test("identical seeds and inputs produce identical paths and statistics", () => {
  const options = { allocation: mixed, years: 3, monthlySip: 2500, simulations: 120, seed: "demo-replay-42" };
  assert.deepEqual(simulatePortfolio(options), simulatePortfolio(options));
  assert.notDeepEqual(simulatePortfolio(options), simulatePortfolio({ ...options, seed: "different-seed" }));
  const randomA = createSeededRandom(987);
  const randomB = createSeededRandom(987);
  assert.deepEqual(Array.from({ length: 10 }, randomA), Array.from({ length: 10 }, randomB));
});

test("zero-return SIP has exact month-end invested value and zero gains", () => {
  const result = simulatePortfolio({ allocation: mixed, years: 4, monthlySip: 1000, simulations: 100, seed: 1, assetAssumptions: deterministicZeroReturns });
  assert.deepEqual(result.finalValues, Array(100).fill(48_000));
  assert.equal(result.projection[4].p10, 48_000);
  assert.equal(result.statistics.totalInvestedCapital, 48_000);
  assert.equal(result.statistics.expectedGains, 0);
  assert.equal(result.statistics.probabilityBelowInvestedCapital, 0);
});

test("zero contribution is supported with no invested capital or drawdown", () => {
  const result = simulatePortfolio({ allocation: { equity: 0, debt: 0, gold: 100 }, years: 2, monthlySip: 0, simulations: 100, seed: 2 });
  assert.ok(result.finalValues.every((value) => value === 0));
  assert.equal(result.statistics.totalInvestedCapital, 0);
  assert.equal(result.statistics.probabilityBelowInvestedCapital, 0);
  assert.equal(result.statistics.maximumDrawdown, 0);
});

test("100 percent allocation to each individual asset produces finite nonnegative paths", () => {
  for (const key of ["equity", "debt", "gold"] as const) {
    const allocation = { equity: 0, debt: 0, gold: 0, [key]: 100 };
    const result = simulatePortfolio({ allocation, years: 2, monthlySip: 100, simulations: 100, seed: `asset-${key}` });
    assert.ok(result.finalValues.every((value) => Number.isFinite(value) && value >= 0), key);
  }
});

test("Cholesky sampling reproduces requested perfect and partial correlation fixtures", () => {
  const perfect: CorrelationMatrix = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
  assert.deepEqual(correlateStandardNormals([1, -2, 0.5], perfect), [1, 1, 1]);
  const partial: CorrelationMatrix = [[1, 0.5, 0], [0.5, 1, 0], [0, 0, 1]];
  const draws = correlateStandardNormals([1, 0, 0], partial);
  assert.deepEqual(draws, [1, 0.5, 0]);
  assert.deepEqual(choleskyCorrelation(DEFAULT_CORRELATION_MATRIX), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
});

test("invalid, asymmetric and non-PSD correlation matrices are rejected", () => {
  assert.throws(() => choleskyCorrelation([[1, 0.2, 0], [0.1, 1, 0], [0, 0, 1]] as unknown as CorrelationMatrix), /symmetric/);
  assert.throws(() => choleskyCorrelation([[1, 0.9, 0.9], [0.9, 1, -0.9], [0.9, -0.9, 1]] as CorrelationMatrix), /positive semidefinite/);
  assert.throws(() => choleskyCorrelation([[1, 1.1, 0], [1.1, 1, 0], [0, 0, 1]] as CorrelationMatrix), /between -1 and 1/);
  assert.throws(() => simulatePortfolio({ allocation: mixed, years: 1, monthlySip: 1, simulations: 100, seed: 1, correlationMatrix: [[1, 0.9, 0.9], [0.9, 1, -0.9], [0.9, -0.9, 1]] }), /positive semidefinite/);
});

test("projection percentiles are ordered and every portfolio value is finite and nonnegative", () => {
  const result = simulatePortfolio({ allocation: mixed, years: 5, monthlySip: 1000, simulations: 250, seed: 123456 });
  for (const point of result.projection) {
    assert.ok(point.p10 <= point.p25 && point.p25 <= point.p50 && point.p50 <= point.p75 && point.p75 <= point.p90);
    assert.ok(Number.isFinite(point.expected) && point.expected >= 0);
  }
  assert.ok(result.finalValues.every((value) => Number.isFinite(value) && value >= 0));
});

test("maximum drawdown is the peak-to-trough decline", () => {
  assert.equal(calculateMaximumDrawdown([100, 120, 60, 90, 150, 75]), 0.5);
  assert.equal(calculateMaximumDrawdown([0, 0, 0]), 0);
  assert.throws(() => calculateMaximumDrawdown([100, -1]), /non-negative/);
});

test("input validation enforces finite weights, horizon, paths, seed and random samples", () => {
  assert.throws(() => simulatePortfolio({ allocation: { equity: 50, debt: 30, gold: 10 }, years: 1, monthlySip: 1, seed: 1 }), /total 100%/);
  assert.throws(() => simulatePortfolio({ allocation: { equity: Number.NaN, debt: 0, gold: 100 }, years: 1, monthlySip: 1, seed: 1 }), /finite percentages/);
  assert.throws(() => simulatePortfolio({ allocation: mixed, years: 0, monthlySip: 1, seed: 1 }), /years/);
  assert.throws(() => simulatePortfolio({ allocation: mixed, years: 1, monthlySip: Infinity, seed: 1 }), /monthlySip/);
  assert.throws(() => simulatePortfolio({ allocation: mixed, years: 1, monthlySip: 1, simulations: MIN_SIMULATIONS - 1, seed: 1 }), /simulations/);
  assert.throws(() => simulatePortfolio({ allocation: mixed, years: 1, monthlySip: 1, simulations: MAX_SIMULATIONS + 1, seed: 1 }), /simulations/);
  assert.throws(() => simulatePortfolio({ allocation: mixed, years: MAX_HORIZON_YEARS + 1, monthlySip: 1, seed: 1 }), /years/);
  assert.throws(() => simulatePortfolio({ allocation: mixed, years: MAX_HORIZON_YEARS, monthlySip: 1, simulations: MAX_SIMULATIONS, seed: 1 }), /cannot exceed/);
  assert.throws(() => simulatePortfolio({ allocation: mixed, years: 1, monthlySip: 1 }), /seed or an injected/);
  assert.throws(() => simulatePortfolio({ allocation: mixed, years: 1, monthlySip: 1, seed: 1, random: () => 1 }), /\[0, 1\)/);
  assert.throws(() => simulatePortfolio({ allocation: mixed, years: 1, monthlySip: 1, seed: "   " }), /seed cannot be empty/);
});
