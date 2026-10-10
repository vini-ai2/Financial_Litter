import { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { getDashboard } from "../services/dashboardService";

const idOf = (req: Request) => typeof req.params.id === "string" ? req.params.id : null;
const loanSchema = z.object({ type: z.enum(["HOME", "AUTO", "GOLD", "PERSONAL"]), principal: z.number().positive(), interestRate: z.number().min(0).max(100), tenureMonths: z.number().int().positive().max(600), outstanding: z.number().min(0), startDate: z.string().datetime() });
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
export async function listLoansController(req: Request, res: Response) { try { return res.json(await prisma.loan.findMany({ where: { userId: req.userId }, orderBy: { startDate: "desc" } })); } catch (e) { return safeError(res,e,"Failed to fetch loans"); } }
export async function createLoanController(req: Request, res: Response) {
  const d = valid(req,res,loanSchema); if (!d) return;
  try {
    const rate = Number(d.interestRate) / 1200, n = Number(d.tenureMonths), principal = Number(d.principal);
    const emi = rate === 0 ? principal / n : principal * rate * Math.pow(1 + rate,n) / (Math.pow(1 + rate,n)-1);
    return res.status(201).json(await prisma.loan.create({ data: { userId:req.userId, type:d.type as never, principal, interestRate:Number(d.interestRate), tenureMonths:n, emiAmount:emi, outstanding:Number(d.outstanding), startDate:new Date(String(d.startDate)) } }));
  } catch(e) { return safeError(res,e,"Failed to create loan"); }
}
export async function updateLoanController(req: Request,res: Response) {
  const id=idOf(req), d=valid(req,res,loanSchema.partial()); if (!id||!d) return;
  try { const found=await prisma.loan.findFirst({where:{id,userId:req.userId}}); if(!found)return res.status(404).json({error:"Loan not found"});
    const merged={principal:Number(d.principal ?? found.principal), interestRate:Number(d.interestRate ?? found.interestRate), tenureMonths:Number(d.tenureMonths ?? found.tenureMonths)};
    const r=merged.interestRate/1200, emi=r===0?merged.principal/merged.tenureMonths:merged.principal*r*Math.pow(1+r,merged.tenureMonths)/(Math.pow(1+r,merged.tenureMonths)-1);
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
