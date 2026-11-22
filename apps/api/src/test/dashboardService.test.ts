import assert from "node:assert/strict";
import { test } from "node:test";
import prisma from "../lib/prisma";
import { aggregateMonthlyIncome, getDashboard } from "../services/dashboardService";

test("monthly income adds recurring equivalents and transaction income, excluding inactive or ineffective sources", () => {
  const asOf = new Date("2026-11-18T12:00:00Z");
  const sources = [
    { amount: 1200, frequency: "MONTHLY", effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveUntil: null, isActive: true },
    { amount: 120, frequency: "WEEKLY", effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveUntil: null, isActive: true },
    { amount: 12000, frequency: "ANNUAL", effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveUntil: null, isActive: true },
    { amount: 9000, frequency: "MONTHLY", effectiveFrom: new Date("2026-11-19T00:00:00Z"), effectiveUntil: null, isActive: true },
    { amount: 8000, frequency: "MONTHLY", effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveUntil: new Date("2026-11-17T23:59:59Z"), isActive: true },
    { amount: 7000, frequency: "MONTHLY", effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveUntil: null, isActive: false },
  ];
  assert.equal(aggregateMonthlyIncome(sources, 500, asOf), 1200 + 120 * 52 / 12 + 1000 + 500);
  assert.equal(aggregateMonthlyIncome([], 500, asOf), 500);
});

test("dashboard income reads remain scoped to the authenticated user", async () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const delegates: Array<[object, string]> = [
    [prisma.user, "findUnique"], [prisma.account, "findMany"], [prisma.investment, "findMany"],
    [prisma.loan, "findMany"], [prisma.incomeSource, "findMany"], [prisma.transaction, "findMany"],
    [prisma.budget, "findMany"], [prisma.bill, "findMany"], [prisma.monthlySnapshot, "findUnique"],
    [prisma.monthlySnapshot, "upsert"],
  ];
  const originals = delegates.map(([delegate, key]) => Object.getOwnPropertyDescriptor(delegate, key));
  let incomeQuery: unknown;
  let budgetQuery: any;
  let transactionQuery: any;
  Object.defineProperty(prisma.user, "findUnique", { configurable: true, value: async () => ({ firstName: "Test", creditScore: null }) });
  for (const delegate of [prisma.account, prisma.investment, prisma.loan, prisma.bill]) {
    Object.defineProperty(delegate, "findMany", { configurable: true, value: async () => [] });
  }
  Object.defineProperty(prisma.budget, "findMany", { configurable: true, value: async (query: any) => { budgetQuery = query; return []; } });
  Object.defineProperty(prisma.incomeSource, "findMany", { configurable: true, value: async (query: unknown) => { incomeQuery = query; return []; } });
  Object.defineProperty(prisma.transaction, "findMany", { configurable: true, value: async (query: any) => { if (query.where.date) transactionQuery = query; return []; } });
  Object.defineProperty(prisma.monthlySnapshot, "findUnique", { configurable: true, value: async () => null });
  Object.defineProperty(prisma.monthlySnapshot, "upsert", { configurable: true, value: async () => ({}) });
  try {
    const result = await getDashboard(userId);
    assert.equal(result.overview.monthlyIncome, 0);
    assert.deepEqual(incomeQuery, { where: { userId, isActive: true } });
    assert.deepEqual(budgetQuery.where, { userId });
    assert.deepEqual(budgetQuery.select, { id: true, goalName: true, targetAmount: true, currentAmount: true, targetDate: true });
    assert.deepEqual(transactionQuery.where.account, { userId });
    assert.ok(transactionQuery.where.date.gte instanceof Date);
    assert.ok(transactionQuery.where.date.lt instanceof Date);
  } finally {
    delegates.forEach(([delegate, key], index) => {
      if (originals[index]) Object.defineProperty(delegate, key, originals[index]!);
      else delete (delegate as Record<string, unknown>)[key];
    });
  }
});
