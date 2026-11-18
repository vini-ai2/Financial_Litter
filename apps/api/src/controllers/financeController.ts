import { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { getDashboard } from "../services/dashboardService";
import { calculateCagr, calculateEmi, calculateFdMaturity, calculateSipFutureValue, type SipPaymentTiming } from "../services/financeCalculations";

const idOf = (req: Request) => typeof req.params.id === "string" ? req.params.id : null;
const loanSchema = z.object({ type: z.enum(["HOME", "AUTO", "GOLD", "PERSONAL"]), principal: z.number().finite().positive(), interestRate: z.number().finite().min(0).max(100), tenureMonths: z.number().int().positive().max(600), outstanding: z.number().finite().min(0), startDate: z.string().datetime() });
const budgetSchema = z.object({ goalName: z.string().trim().min(1).max(100), targetAmount: z.number().positive(), currentAmount: z.number().min(0).default(0), targetDate: z.string().datetime() });
const billSchema = z.object({ name: z.string().trim().min(1).max(100), amount: z.number().positive(), category: z.string().trim().min(1).max(60), dueDate: z.string().datetime(), recurrence: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL"]), isPaid: z.boolean().optional() });

function valid<T>(req: Request, res: Response, schema: z.ZodType<T>): T | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() }); return null; }
  return parsed.data;
}
function safeError(res: Response, error: unknown, message: string) { console.error(error); return res.status(500).json({ error: message }); }

export async function getDashboardController(req: Request, res: Response) {
  try { return res.json(await getDashboard(req.userId)); } catch (error) { return safeError(res, error, "Failed to load dashboard"); }
}

const calculatorSchemas = {
  emi: z.object({ principal: z.number().finite().positive(), annualRatePercent: z.number().finite().min(0), tenureMonths: z.number().int().positive().max(1200) }),
  sip: z.object({ monthlyPayment: z.number().finite().min(0), annualEffectiveRatePercent: z.number().finite().gt(-100), tenureMonths: z.number().int().positive().max(1200), timing: z.enum(["MONTH_END", "BEGINNING_OF_MONTH"]).default("MONTH_END") }),
  cagr: z.object({ beginningValue: z.number().finite().positive(), endingValue: z.number().finite().min(0), years: z.number().finite().positive().max(1000) }),
  fd: z.object({ principal: z.number().finite().positive(), annualNominalRatePercent: z.number().finite().min(0), years: z.number().finite().positive().max(1000), compoundingFrequency: z.number().int().positive().max(365) }),
};

function calculatorInput<T>(req: Request, res: Response, schema: z.ZodType<T>): T | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid calculator inputs", details: parsed.error.flatten() }); return null; }
  return parsed.data;
}

function calculatorResult(res: Response, calculate: () => number, resultKey: string) {
  try {
    const value = calculate();
    if (!Number.isFinite(value)) throw new RangeError("Calculation exceeds the supported numeric range");
    return res.json({ [resultKey]: value });
  } catch (error) {
    if (error instanceof RangeError) return res.status(400).json({ error: error.message });
    return safeError(res, error, "Calculation failed");
  }
}

export function calculateEmiController(req: Request, res: Response) {
  const input = calculatorInput(req, res, calculatorSchemas.emi); if (!input) return;
  return calculatorResult(res, () => calculateEmi(input.principal, input.annualRatePercent, input.tenureMonths), "monthlyPayment");
}
export function calculateSipController(req: Request, res: Response) {
  const input = calculatorInput(req, res, calculatorSchemas.sip); if (!input) return;
  return calculatorResult(res, () => calculateSipFutureValue(input.monthlyPayment, input.annualEffectiveRatePercent, input.tenureMonths, input.timing as SipPaymentTiming), "futureValue");
}
export function calculateCagrController(req: Request, res: Response) {
  const input = calculatorInput(req, res, calculatorSchemas.cagr); if (!input) return;
  return calculatorResult(res, () => calculateCagr(input.beginningValue, input.endingValue, input.years), "annualizedReturn");
}
export function calculateFdController(req: Request, res: Response) {
  const input = calculatorInput(req, res, calculatorSchemas.fd); if (!input) return;
  return calculatorResult(res, () => calculateFdMaturity(input.principal, input.annualNominalRatePercent, input.years, input.compoundingFrequency), "maturityValue");
}

export async function listLoansController(req: Request, res: Response) { try { return res.json(await prisma.loan.findMany({ where: { userId: req.userId }, orderBy: { startDate: "desc" } })); } catch (e) { return safeError(res,e,"Failed to fetch loans"); } }
export async function createLoanController(req: Request, res: Response) {
  const d = valid(req,res,loanSchema); if (!d) return;
  try {
    const n = Number(d.tenureMonths), principal = Number(d.principal);
    const emi = calculateEmi(principal, Number(d.interestRate), n);
    return res.status(201).json(await prisma.loan.create({ data: { userId:req.userId, type:d.type as never, principal, interestRate:Number(d.interestRate), tenureMonths:n, emiAmount:emi, outstanding:Number(d.outstanding), startDate:new Date(String(d.startDate)) } }));
  } catch(e) { return safeError(res,e,"Failed to create loan"); }
}
export async function updateLoanController(req: Request,res: Response) {
  const id=idOf(req), d=valid(req,res,loanSchema.partial()); if (!id||!d) return;
  try { const found=await prisma.loan.findFirst({where:{id,userId:req.userId}}); if(!found)return res.status(404).json({error:"Loan not found"});
    const merged={principal:Number(d.principal ?? found.principal), interestRate:Number(d.interestRate ?? found.interestRate), tenureMonths:Number(d.tenureMonths ?? found.tenureMonths)};
    const emi=calculateEmi(merged.principal,merged.interestRate,merged.tenureMonths);
    return res.json(await prisma.loan.update({where:{id},data:{...d, ...(d.startDate?{startDate:new Date(String(d.startDate))}:{}), ...merged, emiAmount:emi}}));
  } catch(e){return safeError(res,e,"Failed to update loan");}
}
export async function deleteLoanController(req: Request,res: Response) { const id=idOf(req); if(!id)return res.status(400).json({error:"Invalid loan ID"}); try { const r=await prisma.loan.deleteMany({where:{id,userId:req.userId}}); return r.count?res.status(204).send():res.status(404).json({error:"Loan not found"}); }catch(e){return safeError(res,e,"Failed to delete loan");} }

export async function listBudgetsController(req: Request,res: Response){try{return res.json(await prisma.budget.findMany({where:{userId:req.userId},orderBy:{targetDate:"asc"}}));}catch(e){return safeError(res,e,"Failed to fetch goals");}}
export async function createBudgetController(req: Request,res: Response){const d=valid(req,res,budgetSchema);if(!d)return;try{return res.status(201).json(await prisma.budget.create({data:{userId:req.userId,goalName:String(d.goalName),targetAmount:Number(d.targetAmount),currentAmount:Number(d.currentAmount),targetDate:new Date(String(d.targetDate))}}));}catch(e){return safeError(res,e,"Failed to create goal");}}
export async function updateBudgetController(req: Request,res: Response){const id=idOf(req),d=valid(req,res,budgetSchema.partial());if(!id||!d)return;try{const r=await prisma.budget.updateMany({where:{id,userId:req.userId},data:{...d,...(d.targetDate?{targetDate:new Date(String(d.targetDate))}:{})}});if(!r.count)return res.status(404).json({error:"Goal not found"});return res.json(await prisma.budget.findUnique({where:{id}}));}catch(e){return safeError(res,e,"Failed to update goal");}}
export async function deleteBudgetController(req: Request,res: Response){const id=idOf(req);if(!id)return res.status(400).json({error:"Invalid goal ID"});try{const r=await prisma.budget.deleteMany({where:{id,userId:req.userId}});return r.count?res.status(204).send():res.status(404).json({error:"Goal not found"});}catch(e){return safeError(res,e,"Failed to delete goal");}}

export async function listBillsController(req: Request,res: Response){try{return res.json(await prisma.bill.findMany({where:{userId:req.userId},orderBy:{dueDate:"asc"}}));}catch(e){return safeError(res,e,"Failed to fetch bills");}}
export async function createBillController(req: Request,res: Response){const d=valid(req,res,billSchema);if(!d)return;try{return res.status(201).json(await prisma.bill.create({data:{userId:req.userId,name:String(d.name),amount:Number(d.amount),category:String(d.category),dueDate:new Date(String(d.dueDate)),recurrence:d.recurrence as never,isPaid:Boolean(d.isPaid)}}));}catch(e){return safeError(res,e,"Failed to create bill");}}
export async function updateBillController(req: Request,res: Response){const id=idOf(req),d=valid(req,res,billSchema.partial());if(!id||!d)return;try{const r=await prisma.bill.updateMany({where:{id,userId:req.userId},data:{...d,...(d.dueDate?{dueDate:new Date(String(d.dueDate))}:{})}});if(!r.count)return res.status(404).json({error:"Bill not found"});return res.json(await prisma.bill.findUnique({where:{id}}));}catch(e){return safeError(res,e,"Failed to update bill");}}
export async function deleteBillController(req: Request,res: Response){const id=idOf(req);if(!id)return res.status(400).json({error:"Invalid bill ID"});try{const r=await prisma.bill.deleteMany({where:{id,userId:req.userId}});return r.count?res.status(204).send():res.status(404).json({error:"Bill not found"});}catch(e){return safeError(res,e,"Failed to delete bill");}}

export async function getCreditScoreController(req: Request,res: Response){try{const u=await prisma.user.findUnique({where:{id:req.userId},select:{creditScore:true}});return res.json({score:u?.creditScore??null});}catch(e){return safeError(res,e,"Failed to fetch credit score");}}
export async function updateCreditScoreController(req: Request,res: Response){const parsed=z.object({score:z.number().int().min(300).max(900)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Score must be a whole number from 300 to 900"});try{await prisma.user.update({where:{id:req.userId},data:{creditScore:parsed.data.score}});return res.json({score:parsed.data.score});}catch(e){return safeError(res,e,"Failed to save credit score");}}
