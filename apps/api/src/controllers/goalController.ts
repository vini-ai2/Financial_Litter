import type { Request, Response } from "express";
import { Prisma, type GoalStatus } from "@prisma/client";
import { z } from "zod";
import { addManualContribution, archiveGoal, createGoal, getGoal, goalPlan, listEligibleGoalTransactions, listGoalContributions, listGoals, linkTransactionContribution, reverseManualContribution, setGoalStatus, updateGoal } from "../services/goals/goalService";

const money = (positive = false) => z.string()
  .regex(/^(?:0|[1-9]\d{0,25})(?:\.\d{1,12})?$/, "Enter an amount with up to 12 decimal places")
  .refine((value) => { try { const amount = new Prisma.Decimal(value); return positive ? amount.gt(0) : amount.gte(0); } catch { return false; } }, positive ? "Amount must be greater than zero" : "Amount cannot be negative");
const dateValue = z.string().refine((value) => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = dateOnly ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  return Number.isFinite(parsed.getTime()) && (!dateOnly || parsed.toISOString().slice(0, 10) === value);
}, "Enter a valid date");
const idValue = z.string().uuid();
const createSchema = z.object({
  goalName: z.string().trim().min(1).max(100),
  category: z.enum(["SAVINGS", "PURCHASE", "EMERGENCY_FUND", "DEBT_REPAYMENT", "INVESTMENT"]),
  targetAmount: money(true), startingBalance: money().optional(), targetDate: dateValue,
  contributionFrequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"]).default("MONTHLY"),
  plannedContributionAmount: money(true).optional(), linkedLoanId: idValue.optional(), includePortfolio: z.boolean().default(false),
});
const updateSchema = z.object({
  goalName: z.string().trim().min(1).max(100).optional(), targetAmount: money(true).optional(),
  targetDate: dateValue.optional(), contributionFrequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"]).optional(),
  plannedContributionAmount: money(true).nullable().optional(),
}).strict();
const contributionSchema = z.object({ amount: money(true), note: z.string().trim().max(300).optional(), effectiveAt: dateValue.optional(), idempotencyKey: z.string().trim().min(8).max(120) });
const transactionLinkSchema = z.object({ transactionId: idValue });
const statusSchema = z.object({ status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]) });

function fail(res: Response, error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "This contribution or source is already linked" });
  if (error instanceof Error) {
    const messages: Record<string, [number, string]> = {
      DEBT_GOAL_REQUIRES_LOAN: [400, "Debt repayment goals must link to one of your loans"],
      LOAN_NOT_FOUND: [404, "Loan not found"],
      LOAN_LINK_ONLY_FOR_DEBT_GOALS: [400, "Only debt repayment goals can link a loan"],
      PORTFOLIO_LINK_ONLY_FOR_INVESTMENT_GOALS: [400, "Portfolio cost basis can only support an investment goal"],
      DEBT_PROGRESS_USES_LIABILITY_REDUCTION: [400, "Debt progress is measured from outstanding liability reduction"],
      GOAL_NOT_ACTIVE: [409, "Contributions can only be added to active goals"],
      CONTRIBUTION_CANNOT_BE_FUTURE_DATED: [400, "A contribution date cannot be in the future"],
      TRANSACTION_NOT_FOUND: [404, "Transaction not found"],
      RETURN_SCENARIOS_ONLY_FOR_INVESTMENT_GOALS: [400, "Return scenarios are only available for investment goals"],
      GOAL_STATUS_IS_TERMINAL: [409, "Completed and archived goals are closed and cannot be changed"],
    };
    const known = messages[error.message];
    if (known) return res.status(known[0]).json({ error: known[1] });
  }
  console.error(error);
  return res.status(500).json({ error: fallback });
}

const id = (req: Request) => typeof req.params.id === "string" ? req.params.id : "";

export async function listGoalsController(req: Request, res: Response) {
  const parsed = z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional().safeParse(req.query.status);
  if (!parsed.success) return res.status(400).json({ error: "Invalid goal status" });
  try { return res.json(await listGoals(req.userId, parsed.data as GoalStatus | undefined)); }
  catch (error) { return fail(res, error, "Could not load goals"); }
}

export async function listEligibleGoalTransactionsController(req: Request, res: Response) {
  try { return res.json(await listEligibleGoalTransactions(req.userId)); }
  catch (error) { return fail(res, error, "Could not load eligible transactions"); }
}

export async function createGoalController(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid goal data", details: parsed.error.flatten() });
  try { return res.status(201).json(await createGoal(req.userId, parsed.data)); }
  catch (error) { return fail(res, error, "Could not create goal"); }
}

export async function getGoalController(req: Request, res: Response) {
  const parsed = idValue.safeParse(id(req)); if (!parsed.success) return res.status(400).json({ error: "Invalid goal ID" });
  try { const goal = await getGoal(req.userId, parsed.data); return goal ? res.json(goal) : res.status(404).json({ error: "Goal not found" }); }
  catch (error) { return fail(res, error, "Could not load goal"); }
}

export async function updateGoalController(req: Request, res: Response) {
  const parsedId = idValue.safeParse(id(req)); const parsed = updateSchema.safeParse(req.body);
  if (!parsedId.success || !parsed.success) return res.status(400).json({ error: "Invalid goal update", ...(parsed.success ? {} : { details: parsed.error.flatten() }) });
  try { const goal = await updateGoal(req.userId, parsedId.data, parsed.data); return goal ? res.json(goal) : res.status(404).json({ error: "Goal not found" }); }
  catch (error) { return fail(res, error, "Could not update goal"); }
}

export async function setGoalStatusController(req: Request, res: Response) {
  const parsedId = idValue.safeParse(id(req)); const parsed = statusSchema.safeParse(req.body);
  if (!parsedId.success || !parsed.success) return res.status(400).json({ error: "Invalid goal status" });
  try { const goal = await setGoalStatus(req.userId, parsedId.data, parsed.data.status); return goal ? res.json(goal) : res.status(404).json({ error: "Goal not found" }); }
  catch (error) { return fail(res, error, "Could not change goal status"); }
}

export async function archiveGoalController(req: Request, res: Response) {
  const parsedId = idValue.safeParse(id(req)); if (!parsedId.success) return res.status(400).json({ error: "Invalid goal ID" });
  try { const goal = await archiveGoal(req.userId, parsedId.data); return goal ? res.json(goal) : res.status(404).json({ error: "Goal not found" }); }
  catch (error) { return fail(res, error, "Could not archive goal"); }
}

export async function listGoalContributionsController(req: Request, res: Response) {
  const parsedId = idValue.safeParse(id(req)); if (!parsedId.success) return res.status(400).json({ error: "Invalid goal ID" });
  try { const items = await listGoalContributions(req.userId, parsedId.data); return items ? res.json(items.map((item) => ({ ...item, amount: item.amount.toString() }))) : res.status(404).json({ error: "Goal not found" }); }
  catch (error) { return fail(res, error, "Could not load contributions"); }
}

export async function addGoalContributionController(req: Request, res: Response) {
  const parsedId = idValue.safeParse(id(req)); const parsed = contributionSchema.safeParse(req.body);
  if (!parsedId.success || !parsed.success) return res.status(400).json({ error: "Invalid contribution data", ...(parsed.success ? {} : { details: parsed.error.flatten() }) });
  try { const item = await addManualContribution(req.userId, parsedId.data, parsed.data); return item ? res.status(201).json({ ...item, amount: item.amount.toString() }) : res.status(404).json({ error: "Goal not found" }); }
  catch (error) { return fail(res, error, "Could not record contribution"); }
}

export async function linkGoalTransactionController(req: Request, res: Response) {
  const parsedId = idValue.safeParse(id(req)); const parsed = transactionLinkSchema.safeParse(req.body);
  if (!parsedId.success || !parsed.success) return res.status(400).json({ error: "Invalid transaction link" });
  try { const item = await linkTransactionContribution(req.userId, parsedId.data, parsed.data.transactionId); return item ? res.status(201).json({ ...item, amount: item.amount.toString() }) : res.status(404).json({ error: "Goal not found" }); }
  catch (error) { return fail(res, error, "Could not link transaction"); }
}

export async function reverseGoalContributionController(req: Request, res: Response) {
  const parsedGoal = idValue.safeParse(id(req)); const parsedContribution = idValue.safeParse(req.params.contributionId);
  if (!parsedGoal.success || !parsedContribution.success) return res.status(400).json({ error: "Invalid contribution ID" });
  try { const item = await reverseManualContribution(req.userId, parsedGoal.data, parsedContribution.data); return item ? res.status(201).json({ ...item, amount: item.amount.toString() }) : res.status(404).json({ error: "Manual contribution not found or already reversed" }); }
  catch (error) { return fail(res, error, "Could not reverse contribution"); }
}

export async function goalPlanningController(req: Request, res: Response) {
  const parsedId = idValue.safeParse(id(req)); if (!parsedId.success) return res.status(400).json({ error: "Invalid goal ID" });
  let annualReturnPercent: number | undefined;
  if (req.query.annualReturnPercent !== undefined) {
    const parsed = z.coerce.number().finite().gt(-100).max(100).safeParse(req.query.annualReturnPercent);
    if (!parsed.success) return res.status(400).json({ error: "Annual return assumption must be between -100% and 100%" });
    annualReturnPercent = parsed.data;
  }
  try { const plan = await goalPlan(req.userId, parsedId.data, annualReturnPercent); return plan ? res.json(plan) : res.status(404).json({ error: "Goal not found" }); }
  catch (error) { return fail(res, error, "Could not plan goal"); }
}

