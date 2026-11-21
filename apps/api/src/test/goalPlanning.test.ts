import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateGoalBalances, planGoal } from "../services/goals/goalPlanning";

const futureYear = (now: Date) => new Date(now.getTime() + 365 * 86_400_000);

test("savings goal progress preserves decimal precision and excludes reversed source contributions", () => {
  const result = calculateGoalBalances({
    category: "SAVINGS", target: "10", startingBalance: "0.1",
    contributions: [{ amount: "0.2", active: true }, { amount: "9", active: false }],
  });
  assert.equal(result.progress, "0.3");
  assert.equal(result.shortfall, "9.7");
  assert.equal(result.contributionTotal, "0.2");
});

test("debt progress is liability reduction and ignores gross contributions and portfolio values", () => {
  const result = calculateGoalBalances({
    category: "DEBT_REPAYMENT", target: "10000", startingBalance: "50000", loanOutstanding: "42300",
    contributions: [{ amount: "9000", active: true }], includePortfolio: true, portfolioCostBasis: "30000",
  });
  assert.equal(result.progress, "7700");
  assert.equal(result.loanReduction, "7700");
  assert.equal(result.shortfall, "2300");
  assert.equal(result.portfolioCostBasis, null);
});

test("investment goals use invested cost basis without market value or scenario returns", () => {
  const result = calculateGoalBalances({
    category: "INVESTMENT", target: "20000", startingBalance: "500", contributions: [{ amount: "100", active: true }],
    includePortfolio: true, portfolioCostBasis: "12500",
  });
  assert.equal(result.progress, "13100");
  assert.equal(result.portfolioCostBasis, "12500");
});

test("required contributions use the selected frequency and assume no growth", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const monthly = planGoal({ target: 12000, progress: 0, deadline: futureYear(now), frequency: "MONTHLY", plannedContribution: 500, now });
  const quarterly = planGoal({ target: 12000, progress: 0, deadline: futureYear(now), frequency: "QUARTERLY", now });
  assert.equal(monthly.periodsUntilDeadline, 12);
  assert.equal(monthly.requiredContributionPerPeriod, 1000);
  assert.equal(monthly.plannedShortfallPerPeriod, 500);
  assert.equal(quarterly.periodsUntilDeadline, 4);
  assert.equal(quarterly.requiredContributionPerPeriod, 3000);
});

test("return scenarios are explicitly conditional and only use the supplied assumption", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const result = planGoal({ target: 10000, progress: 0, deadline: futureYear(now), frequency: "MONTHLY", plannedContribution: 500, annualReturnPercent: 8, now });
  assert.deepEqual(result.scenarios.map((scenario) => scenario.annualReturnPercent), [0, 8]);
  assert.match(result.assumptions, /not guarantees/i);
});

test("goal planning rejects invalid assumptions", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.throws(() => planGoal({ target: -1, progress: 0, deadline: futureYear(now), frequency: "MONTHLY", now }), /target/);
  assert.throws(() => planGoal({ target: 100, progress: 0, deadline: futureYear(now), frequency: "MONTHLY", plannedContribution: 0, now }), /plannedContribution/);
  assert.throws(() => planGoal({ target: 100, progress: 0, deadline: futureYear(now), frequency: "MONTHLY", annualReturnPercent: -100, now }), /annualReturnPercent/);
});
