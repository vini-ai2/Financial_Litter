import { Prisma } from "@prisma/client";

export function calculateGoalBalances(input: {
  category: "SAVINGS" | "PURCHASE" | "EMERGENCY_FUND" | "DEBT_REPAYMENT" | "INVESTMENT";
  target: string;
  startingBalance: string;
  contributions: Array<{ amount: string; active: boolean }>;
  loanOutstanding?: string | null;
  portfolioCostBasis?: string | null;
  includePortfolio?: boolean;
}) {
  const amount = (value: string) => new Prisma.Decimal(value);
  const contributionTotal = input.contributions.reduce((sum, item) => item.active ? sum.plus(item.amount) : sum, new Prisma.Decimal(0));
  const loanReduction = input.category === "DEBT_REPAYMENT" && input.loanOutstanding != null
    ? Prisma.Decimal.max(amount(input.startingBalance).minus(input.loanOutstanding), new Prisma.Decimal(0))
    : null;
  let progress = input.category === "DEBT_REPAYMENT" ? (loanReduction ?? new Prisma.Decimal(0)) : amount(input.startingBalance).plus(contributionTotal);
  if (input.category === "INVESTMENT" && input.includePortfolio && input.portfolioCostBasis != null) progress = progress.plus(input.portfolioCostBasis);
  const shortfall = Prisma.Decimal.max(amount(input.target).minus(progress), new Prisma.Decimal(0));
  const progressPercent = amount(input.target).gt(0) ? progress.div(input.target).mul(100).toNumber() : 0;
  return {
    progress: progress.toString(), shortfall: shortfall.toString(), contributionTotal: contributionTotal.toString(),
    loanReduction: loanReduction?.toString() ?? null,
    portfolioCostBasis: input.category === "INVESTMENT" && input.includePortfolio ? input.portfolioCostBasis ?? null : null,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
  };
}
import { calculateSipFutureValue } from "../financeCalculations";

export type GoalFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY";
const periodsPerYear: Record<GoalFrequency, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUALLY: 1,
};

export type GoalPlanInput = {
  target: number;
  progress: number;
  deadline: Date;
  frequency: GoalFrequency;
  plannedContribution?: number | null;
  annualReturnPercent?: number;
  now?: Date;
};

/** Required periodic amount assumes no growth. Return scenarios are conditional on a user-entered annual effective rate and month-end deposits. */
export function planGoal(input: GoalPlanInput) {
  const now = input.now ?? new Date();
  for (const [name, value] of [["target", input.target], ["progress", input.progress]] as const) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`);
  }
  if (input.target <= 0) throw new RangeError("target must be greater than zero");
  if (!(input.deadline instanceof Date) || !Number.isFinite(input.deadline.getTime())) throw new RangeError("deadline must be a valid date");
  if (!(input.frequency in periodsPerYear)) throw new RangeError("Unsupported contribution frequency");
  if (input.plannedContribution !== undefined && input.plannedContribution !== null
    && (!Number.isFinite(input.plannedContribution) || input.plannedContribution <= 0)) throw new RangeError("plannedContribution must be greater than zero");
  if (input.annualReturnPercent !== undefined
    && (!Number.isFinite(input.annualReturnPercent) || input.annualReturnPercent <= -100 || input.annualReturnPercent > 100)) throw new RangeError("annualReturnPercent must be greater than -100% and at most 100%");

  const remaining = Math.max(0, input.target - input.progress);
  const periods = Math.max(0, Math.ceil((input.deadline.getTime() - now.getTime()) / 86_400_000 * periodsPerYear[input.frequency] / 365.2425));
  const requiredPerPeriod = remaining === 0 ? 0 : periods > 0 ? remaining / periods : null;
  const monthlyPlan = input.plannedContribution == null ? null : input.plannedContribution * periodsPerYear[input.frequency] / 12;
  const monthsToTarget = (annualRate: number) => {
    if (remaining === 0) return 0;
    if (monthlyPlan === null || monthlyPlan <= 0) return null;
    for (let month = 1; month <= 1200; month += 1) {
      const contributions = calculateSipFutureValue(monthlyPlan, annualRate, month, "MONTH_END");
      const initial = input.progress * Math.pow(1 + annualRate / 100, month / 12);
      if (!Number.isFinite(initial + contributions)) return null;
      if (initial + contributions >= input.target) return month;
    }
    return null;
  };

  const scenarios = [{ annualReturnPercent: 0, monthsToTarget: monthsToTarget(0) }];
  if (input.annualReturnPercent !== undefined && input.annualReturnPercent !== 0) {
    scenarios.push({ annualReturnPercent: input.annualReturnPercent, monthsToTarget: monthsToTarget(input.annualReturnPercent) });
  }
  return {
    shortfall: remaining,
    periodsUntilDeadline: periods,
    requiredContributionPerPeriod: requiredPerPeriod,
    plannedContributionPerPeriod: input.plannedContribution ?? null,
    plannedShortfallPerPeriod: input.plannedContribution == null || requiredPerPeriod === null
      ? null
      : Math.max(0, requiredPerPeriod - input.plannedContribution),
    scenarios,
    assumptions: "Required contributions assume zero growth. Completion scenarios convert the selected frequency to an equivalent monthly contribution, use month-end deposits and apply an annual effective return only when you enter one. Estimates are not guarantees.",
  };
}

