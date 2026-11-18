import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { calculateCagrController, calculateEmiController, calculateFdController, calculateSipController } from "../controllers/financeController";
import { calculateCagr, calculateEmi, calculateFdMaturity, calculateSipFutureValue } from "../services/financeCalculations";

const closeTo = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} differs from ${expected}`);

test("EMI matches an independent amortizing-loan reference and present-value identity", () => {
  const payment = calculateEmi(100_000, 12, 12);
  closeTo(payment, 8884.878867834166, 1e-12);
  const monthlyRate = 0.01;
  const presentValue = payment * (1 - (1 + monthlyRate) ** -12) / monthlyRate;
  closeTo(presentValue, 100_000, 1e-12);
  let balance = 100_000;
  for (let month = 0; month < 12; month++) balance = balance * (1 + monthlyRate) - payment;
  closeTo(balance, 0, 1e-10);
});

test("EMI handles zero rate and a one-month boundary", () => {
  assert.equal(calculateEmi(1200, 0, 12), 100);
  closeTo(calculateEmi(1000, 12, 1), 1010, 1e-12);
});

test("SIP matches month-end reference and beginning-of-month earns one extra period", () => {
  closeTo(calculateSipFutureValue(1000, 12, 12), 12646.497908353187, 1e-12);
  closeTo(calculateSipFutureValue(1000, 12, 12, "BEGINNING_OF_MONTH"), 12766.497908353189, 1e-12);
  const monthlyRate = Math.pow(1.12, 1 / 12) - 1;
  closeTo(calculateSipFutureValue(1000, 12, 12, "BEGINNING_OF_MONTH") / calculateSipFutureValue(1000, 12, 12), 1 + monthlyRate, 1e-12);
});

test("SIP zero-rate and zero-payment cases", () => {
  assert.equal(calculateSipFutureValue(250, 0, 12), 3000);
  assert.equal(calculateSipFutureValue(0, 10, 12), 0);
});

test("CAGR matches one-year and multi-year annualization references", () => {
  closeTo(calculateCagr(100, 110, 1), 0.1, 1e-12);
  closeTo(calculateCagr(100, 121, 2), 0.1, 1e-12);
  assert.equal(calculateCagr(100, 0, 3), -1);
});

test("FD maturity honors annual, semiannual and quarterly compounding frequencies", () => {
  closeTo(calculateFdMaturity(100_000, 8, 2, 1), 116640, 1e-12);
  closeTo(calculateFdMaturity(100_000, 8, 2, 2), 116985.856, 1e-12);
  closeTo(calculateFdMaturity(100_000, 8, 2, 4), 117165.93810022657, 1e-12);
  assert.equal(calculateFdMaturity(100_000, 0, 5, 12), 100_000);
});

test("calculators reject invalid values and numeric overflow", () => {
  assert.throws(() => calculateEmi(0, 5, 12), RangeError);
  assert.throws(() => calculateEmi(100, -1, 12), RangeError);
  assert.throws(() => calculateEmi(100, 5, 0), RangeError);
  assert.throws(() => calculateSipFutureValue(100, -100, 12), RangeError);
  assert.throws(() => calculateSipFutureValue(100, 5, 1.5), RangeError);
  assert.throws(() => calculateSipFutureValue(1e300, 1000, 1200), RangeError);
  assert.throws(() => calculateCagr(0, 1, 1), RangeError);
  assert.throws(() => calculateCagr(1, 1, 0), RangeError);
  assert.throws(() => calculateFdMaturity(100, 5, 1, 0), RangeError);
  assert.throws(() => calculateFdMaturity(1e300, 1000, 1000, 365), RangeError);
  assert.throws(() => calculateEmi(Number.NaN, 1, 12), RangeError);
});

test("calculator API handlers validate input and return convention-specific results", () => {
  const invoke = (handler: (req: Request, res: Response) => unknown, body: unknown) => {
    let statusCode = 200;
    let payload: unknown;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { payload = value; return this; },
    } as unknown as Response;
    handler({ body } as Request, response);
    return { statusCode, payload };
  };
  assert.deepEqual(invoke(calculateEmiController, { principal: 100_000, annualRatePercent: 12, tenureMonths: 12 }), {
    statusCode: 200, payload: { monthlyPayment: calculateEmi(100_000, 12, 12) },
  });
  assert.equal(invoke(calculateSipController, { monthlyPayment: 1000, annualEffectiveRatePercent: 12, tenureMonths: 12 }).statusCode, 200);
  assert.equal(invoke(calculateCagrController, { beginningValue: 100, endingValue: 121, years: 2 }).statusCode, 200);
  assert.equal(invoke(calculateFdController, { principal: 100_000, annualNominalRatePercent: 8, years: 2, compoundingFrequency: 4 }).statusCode, 200);
  assert.equal(invoke(calculateEmiController, { principal: -1, annualRatePercent: 12, tenureMonths: 12 }).statusCode, 400);
  assert.equal(invoke(calculateFdController, { principal: 100_000, annualNominalRatePercent: 8, years: 2, compoundingFrequency: 0 }).statusCode, 400);
});
