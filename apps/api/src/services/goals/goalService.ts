import { Prisma, type GoalCategory, type GoalContributionFrequency, type GoalStatus } from "@prisma/client";
import prisma from "../../lib/prisma";
import { calculateStockHoldings, type StockTradeForLedger } from "../stockLedger";
import { calculateGoalBalances, planGoal, type GoalFrequency } from "./goalPlanning";

const D = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);
const decimalText = (value: Prisma.Decimal) => value.toString();
const PERIODS: Record<GoalFrequency, number> = { WEEKLY: 52, BIWEEKLY: 26, MONTHLY: 12, QUARTERLY: 4, ANNUALLY: 1 };

export type CreateGoalInput = {
  goalName: string; category: GoalCategory; targetAmount: string; startingBalance?: string;
  targetDate: string; contributionFrequency: GoalContributionFrequency;
  plannedContributionAmount?: string; linkedLoanId?: string; includePortfolio?: boolean;
};

async function portfolioCostBasis(userId: string) {
  const [investments, trades] = await Promise.all([
    prisma.investment.findMany({ where: { userId }, select: { investedAmount: true } }),
    prisma.stockTrade.findMany({ where: { userId }, orderBy: [{ tradeDate: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
  ]);
  const legacy = investments.reduce((total, item) => total.plus(item.investedAmount), D(0));
  const stockPositions = calculateStockHoldings(trades as StockTradeForLedger[], false, 12);
  return stockPositions.reduce((total, position) => total.plus(position.costBasis), legacy);
}

function viewGoal(goal: any, loan: any | null, portfolioBasis: Prisma.Decimal | null) {
  const balances = calculateGoalBalances({
    category: goal.category, target: D(goal.targetAmount).toString(), startingBalance: D(goal.startingBalance).toString(),
    contributions: goal.contributions.map((item: any) => ({ amount: D(item.amount).toString(), active: item.active })),
    loanOutstanding: loan ? D(loan.outstanding).toString() : null,
    portfolioCostBasis: portfolioBasis?.toString() ?? null, includePortfolio: goal.includePortfolio,
  });
  const progress = D(balances.progress);
  return {
    ...goal,
    targetAmount: decimalText(D(goal.targetAmount)),
    startingBalance: decimalText(D(goal.startingBalance)),
    plannedContributionAmount: goal.plannedContributionAmount ? decimalText(D(goal.plannedContributionAmount)) : null,
    currentAmount: balances.progress,
    progressAmount: balances.progress,
    progressPercent: balances.progressPercent,
    shortfall: balances.shortfall,
    contributionTotal: balances.contributionTotal,
    portfolioCostBasis: balances.portfolioCostBasis,
    loanOutstanding: loan ? decimalText(D(loan.outstanding)) : null,
    loanInterestRate: loan ? decimalText(D(loan.interestRate)) : null,
    loanEmiAmount: loan ? decimalText(D(loan.emiAmount)) : null,
    loanPrincipalReduction: balances.loanReduction,
    sourceStatus: goal.linkedLoanId && !loan ? "UNAVAILABLE" : "CURRENT",
    contributions: goal.contributions.map((item: any) => ({ ...item, amount: decimalText(D(item.amount)) })),
  };
}

async function loadGoalViews(userId: string, where: Prisma.BudgetWhereInput = {}) {
  const goals = await prisma.budget.findMany({
    where: { userId, ...where },
    include: { contributions: { where: { active: true }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }] } },
    orderBy: [{ targetDate: "asc" }, { createdAt: "desc" }],
  });
  const loanIds = goals.flatMap((goal) => goal.linkedLoanId ? [goal.linkedLoanId] : []);
  const [loans, portfolio] = await Promise.all([
    loanIds.length ? prisma.loan.findMany({ where: { userId, id: { in: loanIds } } }) : Promise.resolve([]),
    goals.some((goal) => goal.includePortfolio) ? portfolioCostBasis(userId) : Promise.resolve(null),
  ]);
  const loanMap = new Map(loans.map((loan) => [loan.id, loan]));
  return goals.map((goal) => viewGoal(goal, goal.linkedLoanId ? loanMap.get(goal.linkedLoanId) ?? null : null, goal.includePortfolio ? portfolio : null));
}

export async function listGoals(userId: string, status?: GoalStatus) {
  return loadGoalViews(userId, status ? { status } : {});
}

export async function getGoal(userId: string, goalId: string) {
  const result = await loadGoalViews(userId, { id: goalId });
  return result[0] ?? null;
}

export async function createGoal(userId: string, input: CreateGoalInput) {
  let loan: { id: string; outstanding: Prisma.Decimal } | null = null;
  if (input.category === "DEBT_REPAYMENT") {
    if (!input.linkedLoanId) throw new Error("DEBT_GOAL_REQUIRES_LOAN");
    loan = await prisma.loan.findFirst({ where: { id: input.linkedLoanId, userId }, select: { id: true, outstanding: true } });
    if (!loan) throw new Error("LOAN_NOT_FOUND");
  } else if (input.linkedLoanId) throw new Error("LOAN_LINK_ONLY_FOR_DEBT_GOALS");
  if (input.includePortfolio && input.category !== "INVESTMENT") throw new Error("PORTFOLIO_LINK_ONLY_FOR_INVESTMENT_GOALS");

  const startingBalance = input.startingBalance === undefined ? (loan?.outstanding ?? D(0)) : D(input.startingBalance);
  const goal = await prisma.budget.create({ data: {
    userId, goalName: input.goalName, category: input.category, targetAmount: D(input.targetAmount),
    currentAmount: startingBalance, startingBalance, targetDate: new Date(input.targetDate),
    contributionFrequency: input.contributionFrequency,
    plannedContributionAmount: input.plannedContributionAmount ? D(input.plannedContributionAmount) : null,
    linkedLoanId: loan?.id ?? null, includePortfolio: input.includePortfolio ?? false,
    portfolioOwnerId: input.includePortfolio ? userId : null,
  } });
  return getGoal(userId, goal.id);
}

export async function updateGoal(userId: string, goalId: string, input: {
  goalName?: string; targetAmount?: string; targetDate?: string;
  contributionFrequency?: GoalContributionFrequency; plannedContributionAmount?: string | null;
}) {
  const existing = await prisma.budget.findFirst({ where: { id: goalId, userId } });
  if (!existing) return null;
  if (existing.status === "COMPLETED" || existing.status === "ARCHIVED") throw new Error("GOAL_STATUS_IS_TERMINAL");
  await prisma.budget.update({ where: { id: goalId }, data: {
    ...(input.goalName !== undefined ? { goalName: input.goalName } : {}),
    ...(input.targetAmount !== undefined ? { targetAmount: D(input.targetAmount) } : {}),
    ...(input.targetDate !== undefined ? { targetDate: new Date(input.targetDate) } : {}),
    ...(input.contributionFrequency !== undefined ? { contributionFrequency: input.contributionFrequency } : {}),
    ...(input.plannedContributionAmount !== undefined ? { plannedContributionAmount: input.plannedContributionAmount === null ? null : D(input.plannedContributionAmount) } : {}),
  } });
  return getGoal(userId, goalId);
}

export async function setGoalStatus(userId: string, goalId: string, status: GoalStatus) {
  const existing = await getGoal(userId, goalId);
  if (!existing) return null;
  if ((existing.status === "COMPLETED" || existing.status === "ARCHIVED") && existing.status !== status) throw new Error("GOAL_STATUS_IS_TERMINAL");
  const freezePortfolio = existing.includePortfolio && (status === "COMPLETED" || status === "ARCHIVED");
  await prisma.budget.update({ where: { id: goalId }, data: {
    status,
    ...(freezePortfolio ? {
      startingBalance: D(existing.progressAmount).minus(existing.contributionTotal),
      currentAmount: D(existing.progressAmount),
      includePortfolio: false,
      portfolioOwnerId: null,
    } : {}),
  } });
  return getGoal(userId, goalId);
}

export async function archiveGoal(userId: string, goalId: string) {
  return setGoalStatus(userId, goalId, "ARCHIVED");
}

export async function addManualContribution(userId: string, goalId: string, input: { amount: string; note?: string; effectiveAt?: string; idempotencyKey: string }) {
  const goal = await prisma.budget.findFirst({ where: { id: goalId, userId } });
  if (!goal) return null;
  if (goal.category === "DEBT_REPAYMENT") throw new Error("DEBT_PROGRESS_USES_LIABILITY_REDUCTION");
  if (goal.status !== "ACTIVE") throw new Error("GOAL_NOT_ACTIVE");
  const effectiveAt = input.effectiveAt ? new Date(input.effectiveAt) : new Date();
  if (effectiveAt.getTime() > Date.now()) throw new Error("CONTRIBUTION_CANNOT_BE_FUTURE_DATED");
  const contribution = await prisma.goalContribution.create({ data: {
    userId, budgetId: goalId, amount: D(input.amount), type: "MANUAL", effectiveAt,
    note: input.note ?? null, idempotencyKey: input.idempotencyKey,
  } });
  return contribution;
}

export async function linkTransactionContribution(userId: string, goalId: string, transactionId: string) {
  const goal = await prisma.budget.findFirst({ where: { id: goalId, userId } });
  if (!goal) return null;
  if (goal.category === "DEBT_REPAYMENT") throw new Error("DEBT_PROGRESS_USES_LIABILITY_REDUCTION");
  if (goal.status !== "ACTIVE") throw new Error("GOAL_NOT_ACTIVE");
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, account: { userId } }, include: { account: { select: { userId: true } } } });
  if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");
  return prisma.goalContribution.create({ data: {
    userId, budgetId: goalId, amount: D(transaction.amount), type: "TRANSACTION", effectiveAt: transaction.date,
    note: transaction.description || transaction.category, idempotencyKey: `transaction:${transaction.id}`,
    sourceTransactionId: transaction.id,
  } });
}

export async function reverseManualContribution(userId: string, goalId: string, contributionId: string) {
  const goal = await prisma.budget.findFirst({ where: { id: goalId, userId }, select: { status: true } });
  if (!goal) return null;
  if (goal.status === "COMPLETED" || goal.status === "ARCHIVED") throw new Error("GOAL_STATUS_IS_TERMINAL");
  const original = await prisma.goalContribution.findFirst({ where: { id: contributionId, userId, budgetId: goalId, type: "MANUAL", active: true } });
  if (!original) return null;
  return prisma.goalContribution.create({ data: {
    userId, budgetId: goalId, amount: original.amount.negated(), type: "REVERSAL", effectiveAt: new Date(),
    note: `Reversal of contribution ${original.id}`, idempotencyKey: `reversal:${original.id}`, reversesContributionId: original.id,
  } });
}

export async function listGoalContributions(userId: string, goalId: string) {
  const goal = await prisma.budget.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!goal) return null;
  return prisma.goalContribution.findMany({ where: { userId, budgetId: goalId }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }] });
}

export async function goalPlan(userId: string, goalId: string, annualReturnPercent?: number) {
  const goal = await getGoal(userId, goalId);
  if (!goal) return null;
  if (goal.category === "DEBT_REPAYMENT") {
    const remaining = D(goal.shortfall);
    const days = Math.max(0, Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / 86_400_000));
    const periods = Math.ceil(days * PERIODS[goal.contributionFrequency as GoalFrequency] / 365.2425);
    let completionEstimateMonths: number | null = null;
    if (goal.loanOutstanding !== null && goal.loanInterestRate !== null && goal.loanEmiAmount !== null) {
      const startBalance = Number(goal.loanOutstanding);
      const targetBalance = Number(goal.startingBalance) - Number(goal.targetAmount);
      const monthlyRate = Number(goal.loanInterestRate) / 1200;
      const emi = Number(goal.loanEmiAmount);
      if (startBalance <= targetBalance) completionEstimateMonths = 0;
      else if (targetBalance >= 0 && emi > startBalance * monthlyRate) {
        let balance = startBalance;
        for (let month = 1; month <= 1200; month += 1) {
          balance = Math.max(0, balance * (1 + monthlyRate) - emi);
          if (balance <= targetBalance) { completionEstimateMonths = month; break; }
        }
      }
    }
    return { shortfall: decimalText(remaining), periodsUntilDeadline: periods, requiredContributionPerPeriod: periods > 0 ? decimalText(remaining.div(periods)) : null,
      plannedContributionPerPeriod: null, plannedShortfallPerPeriod: null, scenarios: [], completionEstimateMonths,
      assumptions: "Required periodic amount measures liability reduction, not gross payments. Completion estimate applies the linked loan's current EMI and interest rate monthly, with no rate or payment changes; it is not a guarantee." };
  }
  if (annualReturnPercent !== undefined && goal.category !== "INVESTMENT") throw new Error("RETURN_SCENARIOS_ONLY_FOR_INVESTMENT_GOALS");
  const planned = goal.plannedContributionAmount === null ? null : Number(goal.plannedContributionAmount);
  const plan = planGoal({ target: Number(goal.targetAmount), progress: Number(goal.progressAmount), deadline: new Date(goal.targetDate), frequency: goal.contributionFrequency, plannedContribution: planned, ...(annualReturnPercent === undefined ? {} : { annualReturnPercent }) });
  return {
    ...plan,
    shortfall: plan.shortfall.toFixed(2),
    requiredContributionPerPeriod: plan.requiredContributionPerPeriod?.toFixed(2) ?? null,
    plannedContributionPerPeriod: plan.plannedContributionPerPeriod?.toFixed(2) ?? null,
    plannedShortfallPerPeriod: plan.plannedShortfallPerPeriod?.toFixed(2) ?? null,
  };
}

export async function listEligibleGoalTransactions(userId: string) {
  const linked = await prisma.goalContribution.findMany({ where: { userId, sourceTransactionId: { not: null } }, select: { sourceTransactionId: true } });
  const linkedIds = linked.flatMap((item) => item.sourceTransactionId ? [item.sourceTransactionId] : []);
  return prisma.transaction.findMany({
    where: { account: { userId }, ...(linkedIds.length ? { id: { notIn: linkedIds } } : {}) },
    select: { id: true, amount: true, type: true, category: true, description: true, date: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}
