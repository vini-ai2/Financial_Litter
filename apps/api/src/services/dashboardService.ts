import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";

const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const monthly = (amount: number, f: string) => f === "WEEKLY" ? amount * 52 / 12 : f === "ANNUAL" ? amount / 12 : amount;

export async function getDashboard(userId: string) {
  const now = new Date(), year = now.getUTCFullYear(), month = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1)), nextMonth = new Date(Date.UTC(year, month + 1, 1));
  const upcomingEnd = new Date(now); upcomingEnd.setDate(upcomingEnd.getDate() + 30);
  const previousYear=month===0?year-1:year, previousMonth=month===0?12:month;
  const [user, accounts, investments, loans, incomeSources, monthTransactions, recentTransactions, budgets, bills, priorSnapshot] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, creditScore: true } }),
    prisma.account.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.investment.findMany({ where: { userId }, orderBy: { purchaseDate: "desc" } }),
    prisma.loan.findMany({ where: { userId }, orderBy: { startDate: "desc" } }),
    prisma.incomeSource.findMany({ where: { userId, isActive: true } }),
    prisma.transaction.findMany({ where: { account: { userId }, date: { gte: monthStart, lt: nextMonth } } }),
    prisma.transaction.findMany({ where: { account: { userId } }, include: { account: { select: { id: true, name: true, type: true } } }, orderBy: { date: "desc" }, take: 12 }),
    prisma.budget.findMany({ where: { userId }, orderBy: { targetDate: "asc" } }),
    prisma.bill.findMany({ where: { userId }, orderBy: { dueDate: "asc" } }),
    prisma.monthlySnapshot.findUnique({ where: { userId_year_month: { userId, year: previousYear, month: previousMonth } } }),
  ]);
  const income = incomeSources.filter((s) => s.effectiveFrom <= now && (!s.effectiveUntil || s.effectiveUntil >= now)).reduce((sum,s)=>sum+monthly(n(s.amount),s.frequency),0);
  const expenses = monthTransactions.filter(t=>t.type === "EXPENSE").reduce((sum,t)=>sum+n(t.amount),0);
  const expenseCategories = [...monthTransactions.filter(t=>t.type === "EXPENSE").reduce((map,t)=>map.set(t.category,(map.get(t.category)||0)+n(t.amount)),new Map<string,number>()).entries()].map(([category,amount])=>({category,amount})).sort((a,b)=>b.amount-a.amount);
  const transactionIncome = monthTransactions.filter(t=>t.type === "INCOME").reduce((sum,t)=>sum+n(t.amount),0);
  const totalIncome = income || transactionIncome;
  const savingsRate = totalIncome > 0 ? ((totalIncome-expenses)/totalIncome)*100 : null;
  const accountAssets = accounts.reduce((s,a)=>s+n(a.balance),0), investmentAssets = investments.reduce((s,i)=>s+n(i.currentValue),0);
  const assets = accountAssets+investmentAssets, liabilities = loans.reduce((s,l)=>s+n(l.outstanding),0), netWorth=assets-liabilities;
  const monthlyDebt = loans.reduce((s,l)=>s+n(l.emiAmount),0), dti = totalIncome>0 ? monthlyDebt/totalIncome*100 : null;
  const liquid = accounts.filter(a=>["CHECKING","SAVINGS","SALARY"].includes(a.type)).reduce((s,a)=>s+n(a.balance),0);
  const emergencyMonths=expenses>0?liquid/expenses:null;
  const savingPoints=savingsRate===null?0:Math.max(0,Math.min(40,savingsRate/20*40));
  const dtiPoints=dti===null?0:Math.max(0,Math.min(30,(1-dti/30)*30));
  const emergencyPoints=emergencyMonths===null?0:Math.max(0,Math.min(30,emergencyMonths/3*30));
  const healthScore=Math.round(savingPoints+dtiPoints+emergencyPoints);
  // Persist a monthly point-in-time snapshot to support a real month-over-month comparison.
  await prisma.monthlySnapshot.upsert({ where:{ userId_year_month:{userId,year,month:month+1}}, create:{userId,year,month:month+1,totalAssets:assets,totalLiabilities:liabilities,netWorth}, update:{totalAssets:assets,totalLiabilities:liabilities,netWorth,capturedAt:now} });
  const upcomingBills=bills.filter(b=>!b.isPaid&&b.dueDate>=now&&b.dueDate<=upcomingEnd);
  const recurringBills=bills.filter(b=>b.category.toLowerCase().includes("subscription"));
  const txnGroups=new Map<string, typeof recentTransactions>();
  for(const t of recentTransactions){const label=(t.description.trim()||t.category).toLowerCase();const group=txnGroups.get(label)||[];group.push(t);txnGroups.set(label,group);}
  const detectedRecurring=[...txnGroups.entries()].flatMap(([label,ts])=>{
    const sorted=[...ts].sort((a,b)=>b.date.getTime()-a.date.getTime());
    const matches=sorted.slice(1).filter((t,index)=>{
      const previous=sorted[index];const days=Math.abs(previous.date.getTime()-t.date.getTime())/86400000;
      const high=Math.max(n(previous.amount),n(t.amount)),low=Math.min(n(previous.amount),n(t.amount));
      return days>=25&&days<=35&&high>0&&(high-low)/high<=0.2;
    });
    return matches.length?[{label,count:matches.length+1,typicalAmount:matches.reduce((s,t)=>s+n(t.amount),n(sorted[0].amount))/(matches.length+1),lastDate:sorted[0].date}]:[];
  });
  const enrichedBudgets=budgets.map(b=>{const gap=Math.max(0,n(b.targetAmount)-n(b.currentAmount));const months=Math.max(1,(b.targetDate.getTime()-now.getTime())/(30.4375*86400000));return {...b,progressPercent:Math.min(100,n(b.currentAmount)/Math.max(1,n(b.targetAmount))*100),requiredMonthlySaving:gap/months};});
  return {
    user:{firstName:user?.firstName??""}, month:`${year}-${String(month+1).padStart(2,"0")}`,
    overview:{monthlyIncome:totalIncome,monthlyExpenses:expenses,transactionIncome,netWorth,assets,liabilities,netWorthChange:priorSnapshot?netWorth-n(priorSnapshot.netWorth):null,savingsRate,creditScore:user?.creditScore??null,healthScore,healthBreakdown:{savingsRate:Math.round(savingPoints),debtToIncome:Math.round(dtiPoints),emergencyFund:Math.round(emergencyPoints),savingsRatePercent:savingsRate,debtToIncomePercent:dti,emergencyFundMonths:emergencyMonths}},
    accounts, investments, loans, incomeSources, transactions:recentTransactions, budgets:enrichedBudgets,
    bills, upcomingBills, recurringBills, detectedRecurring, expenseCategories,
    assetBreakdown:[...accounts.reduce((m,a)=>m.set(a.type,(m.get(a.type)||0)+n(a.balance)),new Map<string,number>()).entries()].map(([type,value])=>({type,value})).concat(investments.map(i=>({type:i.category,value:n(i.currentValue)}))),
    liabilityBreakdown:[...loans.reduce((m,l)=>m.set(l.type,(m.get(l.type)||0)+n(l.outstanding)),new Map<string,number>()).entries()].map(([type,value])=>({type,value})),
  };
}
