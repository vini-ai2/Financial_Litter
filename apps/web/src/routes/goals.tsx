import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { PageIntro, StatePanel } from "@/components/ui/product";
import { financeApi, restoreAccessToken, type FinancialGoal, type GoalCategory, type GoalContribution, type GoalFrequency, type GoalPlan, type GoalStatus } from "@/lib/api";

const money = (value: string | number | null | undefined) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value ?? 0));
const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateInput = (value: string) => new Date(value).toISOString().slice(0, 10);
const categories: Array<[GoalCategory, string]> = [["SAVINGS", "Savings"], ["PURCHASE", "Purchase"], ["EMERGENCY_FUND", "Emergency fund"], ["DEBT_REPAYMENT", "Debt repayment"], ["INVESTMENT", "Investment"]];
const frequencies: Array<[GoalFrequency, string]> = [["WEEKLY", "Weekly"], ["BIWEEKLY", "Every two weeks"], ["MONTHLY", "Monthly"], ["QUARTERLY", "Quarterly"], ["ANNUALLY", "Annually"]];
const statusLabels: Record<GoalStatus, string> = { ACTIVE: "Active", PAUSED: "Paused", COMPLETED: "Completed", ARCHIVED: "Archived" };
const field = "field-input";
const primary = "button button--primary";
const secondary = "button button--secondary";

export const Route = createFileRoute("/goals")({
  head: () => ({ meta: [{ title: "Financial goals · FinLitter" }, { name: "description", content: "Set a target, track real contributions and explore a plan to reach it." }] }),
  component: GoalsPage,
});

function GoalsPage() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [contributions, setContributions] = useState<GoalContribution[]>([]);
  const [plan, setPlan] = useState<GoalPlan | null>(null);
  const [filter, setFilter] = useState<GoalStatus | "ALL">("ACTIVE");
  const [returnAssumption, setReturnAssumption] = useState("");
  const [draftCategory, setDraftCategory] = useState<GoalCategory>("SAVINGS");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextGoals, nextLoans, nextTransactions] = await Promise.all([financeApi.goals(), financeApi.loans(), financeApi.eligibleGoalTransactions()]);
      setGoals(nextGoals); setLoans(nextLoans); setTransactions(nextTransactions);
      setSelectedId((current) => nextGoals.some((goal) => goal.id === current) ? current : nextGoals.find((goal) => goal.status === "ACTIVE")?.id ?? nextGoals[0]?.id ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Goals could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let current = true;
    restoreAccessToken().then((hasSession) => { if (!current) return; if (hasSession) { setAuthorized(true); void load(); } else void navigate({ to: "/login", replace: true }); })
      .catch((reason) => { if (current) { setError(reason instanceof Error ? reason.message : "Could not reconnect to your account."); setLoading(false); } });
    return () => { current = false; };
  }, [load, navigate]);

  const selected = useMemo(() => goals.find((goal) => goal.id === selectedId) ?? null, [goals, selectedId]);
  const visibleGoals = useMemo(() => filter === "ALL" ? goals : goals.filter((goal) => goal.status === filter), [filter, goals]);
  useEffect(() => {
    let current = true;
    if (!authorized || !selectedId) { setContributions([]); setPlan(null); return; }
    Promise.all([
      financeApi.goalContributions(selectedId),
      financeApi.goalPlan(selectedId, selected?.category === "INVESTMENT" && returnAssumption.trim() !== "" ? Number(returnAssumption) : undefined),
    ]).then(([items, nextPlan]) => { if (current) { setContributions(items); setPlan(nextPlan); } })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : "Goal details could not be loaded."); });
    return () => { current = false; };
  }, [authorized, selectedId, selected?.category, returnAssumption]);

  async function act(work: () => Promise<unknown>, message: string): Promise<boolean> {
    setSaving(true); setError(""); setNotice("");
    try { await work(); await load(); setNotice(message); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That change could not be saved."); return false; }
    finally { setSaving(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const category = String(form.get("category")) as GoalCategory;
    const payload = {
      goalName: String(form.get("goalName")), category, targetAmount: String(form.get("targetAmount")),
      ...(String(form.get("startingBalance") || "").trim() ? { startingBalance: String(form.get("startingBalance")) } : {}), targetDate: String(form.get("targetDate")),
      contributionFrequency: String(form.get("frequency")) as GoalFrequency,
      ...(String(form.get("plannedAmount")) ? { plannedContributionAmount: String(form.get("plannedAmount")) } : {}),
      ...(category === "DEBT_REPAYMENT" && String(form.get("linkedLoanId")) ? { linkedLoanId: String(form.get("linkedLoanId")) } : {}),
      includePortfolio: category === "INVESTMENT" && form.get("includePortfolio") === "on",
    };
    const saved = await act(async () => { const created = await financeApi.createGoal(payload); setSelectedId(created.id); }, "Goal created.");
    if (saved) { formElement.reset(); setDraftCategory("SAVINGS"); }
  }

  async function contribute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const formElement = event.currentTarget; const form = new FormData(formElement);
    const saved = await act(() => financeApi.addGoalContribution(selected.id, { amount: String(form.get("amount")), note: String(form.get("note") || "") || undefined, idempotencyKey: crypto.randomUUID() }), "Contribution recorded.");
    if (saved) formElement.reset();
  }

  async function linkTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const form = new FormData(event.currentTarget);
    await act(() => financeApi.linkGoalTransaction(selected.id, String(form.get("transactionId"))), "Transaction linked as a contribution.");
  }

  async function updateSelectedGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const form = new FormData(event.currentTarget);
    await act(() => financeApi.updateGoal(selected.id, {
      goalName: String(form.get("goalName")), targetAmount: String(form.get("targetAmount")), targetDate: String(form.get("targetDate")),
      contributionFrequency: String(form.get("frequency")) as GoalFrequency,
      plannedContributionAmount: String(form.get("plannedAmount") || "").trim() ? String(form.get("plannedAmount")) : null,
    }), "Goal details updated.");
  }

  if (!authorized && loading) return <main className="screen-state"><div className="loading-mark" /><p role="status">Opening your goals…</p></main>;
  return <AuthenticatedShell active="goals">
    <div className="goal-page space-y-7">
      <PageIntro eyebrow="Plan with real balances" title="Financial goals" description="Choose a target and deadline, record actual contributions, and see the pace required. Investment scenarios are estimates; portfolio progress uses invested cost basis, not market gains." />
      {error && <StatePanel tone="error" title="Goals need attention"><p>{error}</p><button className={`${secondary} mt-3`} onClick={() => { setError(""); void load(); }}>Try again</button></StatePanel>}
      {notice && <StatePanel tone="success">{notice}</StatePanel>}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="product-eyebrow">Your plan</p><h2 className="mt-1 font-display text-xl">Goals and progress</h2></div><label className="field-label grid gap-1">Show<select className={field} value={filter} onChange={(event) => setFilter(event.target.value as GoalStatus | "ALL")}><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="COMPLETED">Completed</option><option value="ARCHIVED">Archived</option><option value="ALL">All goals</option></select></label></div>
          {loading ? <StatePanel><span className="inline-flex items-center gap-2"><span className="loading-mark" />Loading your goals…</span></StatePanel> : visibleGoals.length === 0 ? <StatePanel title="No goals in this view">Create a goal to set a target, deadline and contribution plan.</StatePanel> :
            <div className="space-y-3">{visibleGoals.map((goal) => <button key={goal.id} type="button" onClick={() => setSelectedId(goal.id)} aria-pressed={selectedId === goal.id} className={`goal-card w-full text-left ${selectedId === goal.id ? "goal-card--selected" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="product-eyebrow">{categories.find(([value]) => value === goal.category)?.[1]} · {statusLabels[goal.status]}</p><h3 className="mt-1 font-display text-lg">{goal.goalName}</h3></div><span className="font-display text-sm tabular-nums">{goal.progressPercent.toFixed(0)}%</span></div>
              <div className="mt-3 flex justify-between gap-2 text-sm"><span>{money(goal.progressAmount)} saved or reduced</span><span className="text-muted-foreground">of {money(goal.targetAmount)}</span></div>
              <div className="goal-progress mt-2" role="progressbar" aria-label={`${goal.goalName} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(goal.progressPercent)}><span style={{ width: `${goal.progressPercent}%` }} /></div>
              <p className="mt-2 text-xs text-muted-foreground">{money(goal.shortfall)} remaining · target {dateLabel(goal.targetDate)} · {frequencies.find(([value]) => value === goal.contributionFrequency)?.[1].toLowerCase()} plan</p>
            </button>)}</div>}
          <details className="goal-create surface-panel p-4 sm:p-5"><summary className="cursor-pointer font-display text-base font-semibold">Create a goal</summary>
            <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void create(event)}>
              <label className="field-label grid gap-1 sm:col-span-2">Goal name<input className={field} name="goalName" required maxLength={100} placeholder="For example, laptop fund" /></label>
              <label className="field-label grid gap-1">Category<select className={field} name="category" value={draftCategory} onChange={(event) => setDraftCategory(event.target.value as GoalCategory)}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field-label grid gap-1">Target (₹)<input className={field} name="targetAmount" type="number" min="0.01" step="0.01" required /></label>
              <label className="field-label grid gap-1">Already set aside (₹)<input className={field} name="startingBalance" type="number" min="0" step="0.01" placeholder={draftCategory === "DEBT_REPAYMENT" ? "Use current loan balance" : "0"} /><small>{draftCategory === "DEBT_REPAYMENT" ? "Leave blank to use the selected loan’s current outstanding balance as the baseline." : "Leave blank to start from zero."}</small></label>
              <label className="field-label grid gap-1">Target date<input className={field} name="targetDate" type="date" min={new Date().toISOString().slice(0, 10)} required /></label>
              <label className="field-label grid gap-1">Contribution frequency<select className={field} name="frequency" defaultValue="MONTHLY">{frequencies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field-label grid gap-1">Planned amount per period (optional)<input className={field} name="plannedAmount" type="number" min="0.01" step="0.01" /></label>
              {draftCategory === "DEBT_REPAYMENT" && <label className="field-label grid gap-1 sm:col-span-2">Loan for debt repayment<select className={field} name="linkedLoanId" required defaultValue=""><option value="" disabled>Choose your loan</option>{loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.type} · {money(loan.outstanding)} outstanding</option>)}</select><small>Progress tracks the fall in outstanding balance, not gross payments.</small></label>}
              {draftCategory === "INVESTMENT" && <label className="flex items-start gap-2 text-sm sm:col-span-2"><input name="includePortfolio" type="checkbox" className="mt-1 accent-primary" /><span>Include current portfolio cost basis. This counts invested amounts only, not market gains. One goal per account can link the portfolio.</span></label>}
              <div className="sm:col-span-2"><button className={primary} disabled={saving}>Create goal</button></div>
            </form>
          </details>
        </div>

        <section className="space-y-4" aria-label="Selected goal details">
          {!selected ? <StatePanel title="Choose a goal">Select a goal to see its contribution history and plan.</StatePanel> : <>
            <div className="surface-panel p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="product-eyebrow">Selected goal</p><h2 className="mt-1 font-display text-xl">{selected.goalName}</h2><p className="mt-1 text-sm text-muted-foreground">{categories.find(([value]) => value === selected.category)?.[1]} · due {dateLabel(selected.targetDate)}</p></div><label className="field-label grid gap-1">Status<select className={field} value={selected.status} disabled={saving || selected.status === "COMPLETED" || selected.status === "ARCHIVED"} onChange={(event) => void act(() => financeApi.setGoalStatus(selected.id, event.target.value as GoalStatus), `Goal marked ${statusLabels[event.target.value as GoalStatus].toLowerCase()}.`)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
              <div className="mt-5 grid grid-cols-2 gap-4"><div><p className="field-label">Progress</p><p className="mt-1 font-display text-xl tabular-nums">{money(selected.progressAmount)}</p></div><div><p className="field-label">Still needed</p><p className="mt-1 font-display text-xl tabular-nums">{money(selected.shortfall)}</p></div></div>
              {selected.category === "DEBT_REPAYMENT" && <p className="mt-4 rounded-md bg-secondary/50 p-3 text-sm">Outstanding balance: {selected.loanOutstanding ? money(selected.loanOutstanding) : "Unavailable"}. Progress is starting liability minus current liability; gross loan payments are never counted as principal reduction. {selected.sourceStatus === "UNAVAILABLE" && "The linked loan is unavailable."}</p>}
              {selected.includePortfolio && <p className="mt-3 rounded-md bg-secondary/50 p-3 text-sm">Portfolio cost basis included: {money(selected.portfolioCostBasis)}. Market value, unrealized gains and simulator results are excluded.</p>}
              <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-sm font-medium">Edit target and plan</summary><form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void updateSelectedGoal(event)}><label className="field-label grid gap-1">Goal name<input className={field} name="goalName" defaultValue={selected.goalName} required maxLength={100} /></label><label className="field-label grid gap-1">Target amount (₹)<input className={field} name="targetAmount" type="number" min="0.01" step="0.01" defaultValue={selected.targetAmount} required /></label><label className="field-label grid gap-1">Target date<input className={field} name="targetDate" type="date" defaultValue={dateInput(selected.targetDate)} required /></label><label className="field-label grid gap-1">Contribution frequency<select className={field} name="frequency" defaultValue={selected.contributionFrequency}>{frequencies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-label grid gap-1 sm:col-span-2">Planned amount per period<input className={field} name="plannedAmount" type="number" min="0.01" step="0.01" defaultValue={selected.plannedContributionAmount ?? ""} placeholder="Leave blank to clear" /></label><button className={`${secondary} sm:col-span-2 justify-self-start`} disabled={saving}>Save changes</button></form></details>
              <div className="mt-4 flex flex-wrap gap-2">{selected.status === "ACTIVE" && <button className={secondary} disabled={saving} onClick={() => void act(() => financeApi.setGoalStatus(selected.id, "PAUSED"), "Goal paused.")}>Pause</button>}{selected.status === "PAUSED" && <button className={secondary} disabled={saving} onClick={() => void act(() => financeApi.setGoalStatus(selected.id, "ACTIVE"), "Goal resumed.")}>Resume</button>}<button className={secondary} disabled={saving || selected.status === "ARCHIVED" || selected.status === "COMPLETED"} onClick={() => void act(() => financeApi.archiveGoal(selected.id), "Goal archived.")}>Archive</button></div>
            </div>

            {selected.category !== "DEBT_REPAYMENT" && selected.status === "ACTIVE" && <div className="surface-panel p-4 sm:p-5"><h3 className="font-display text-base font-semibold">Record a contribution</h3><form onSubmit={(event) => void contribute(event)} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="field-label grid gap-1">Amount (₹)<input name="amount" className={field} type="number" min="0.01" step="0.01" required /></label><label className="field-label grid gap-1">Note (optional)<input name="note" className={field} maxLength={300} /></label><div className="sm:col-span-2"><button className={primary} disabled={saving}>Add contribution</button></div></form>
              <form onSubmit={(event) => void linkTransaction(event)} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_auto]"><label className="field-label grid gap-1">Link an existing transaction<select name="transactionId" className={field} required defaultValue=""><option value="" disabled>Select a transaction</option>{transactions.map((transaction) => <option key={transaction.id} value={transaction.id}>{dateLabel(transaction.date)} · {transaction.description || transaction.category} · {money(transaction.amount)}</option>)}</select><small>Link only transactions that represent money set aside for this goal. A transaction can belong to one goal only.</small></label><button className={secondary} disabled={saving}>Link transaction</button></form>
            </div>}

            <div className="surface-panel p-4 sm:p-5"><div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-display text-base font-semibold">Plan to the deadline</h3><p className="mt-1 text-sm text-muted-foreground">Required amount assumes no growth.</p></div>{selected.category === "INVESTMENT" && <label className="field-label grid gap-1">Optional annual return assumption (%)<input className={field} type="number" min="-99.99" max="100" step="0.1" value={returnAssumption} onChange={(event) => setReturnAssumption(event.target.value)} placeholder="Leave blank for 0% only" /></label>}</div>
              {plan ? <><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-md bg-secondary/50 p-3"><p className="field-label">Needed per {selected.contributionFrequency.toLowerCase()}</p><p className="mt-1 font-display text-lg">{plan.requiredContributionPerPeriod === null ? "Deadline passed" : money(plan.requiredContributionPerPeriod)}</p></div><div className="rounded-md bg-secondary/50 p-3"><p className="field-label">Plan gap per period</p><p className="mt-1 font-display text-lg">{plan.plannedShortfallPerPeriod === null ? "Add a planned amount" : money(plan.plannedShortfallPerPeriod)}</p></div></div>
                {selected.category === "DEBT_REPAYMENT" ? <div className="mt-4 goal-scenario"><span>Linked loan schedule estimate</span><strong>{plan.completionEstimateMonths === undefined || plan.completionEstimateMonths === null ? "Could not estimate payoff" : plan.completionEstimateMonths === 0 ? "Reduction target reached" : `About ${plan.completionEstimateMonths} months`}</strong></div> : <div className="mt-4"><p className="field-label">Completion scenarios</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{plan.scenarios.map((scenario) => <div key={scenario.annualReturnPercent} className="goal-scenario"><span>{scenario.annualReturnPercent}% annual return assumption</span><strong>{scenario.monthsToTarget === null ? "Not reached within 100 years" : scenario.monthsToTarget === 0 ? "Already at target" : `About ${scenario.monthsToTarget} months`}</strong></div>)}</div></div>}<p className="mt-3 text-xs leading-relaxed text-muted-foreground">{plan.assumptions} Simulated returns are never added to actual goal progress.</p></> : <p className="mt-3 text-sm text-muted-foreground">Loading plan…</p>}
            </div>

            <div className="surface-panel p-4 sm:p-5"><div className="flex items-baseline justify-between gap-2"><h3 className="font-display text-base font-semibold">Contribution history</h3><span className="text-xs text-muted-foreground">{contributions.length} entries</span></div>
              {contributions.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{selected.category === "DEBT_REPAYMENT" ? "This goal follows the linked loan’s current outstanding balance. Historical balance changes are not available in the loan record." : "No contributions recorded yet."}</p> : <div className="mt-3 divide-y divide-border">{contributions.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-medium">{item.note || (item.type === "TRANSACTION" ? "Linked transaction" : item.type === "REVERSAL" ? "Reversal" : "Manual contribution")}</p><p className="text-xs text-muted-foreground">{dateLabel(item.effectiveAt)} · {item.type.toLowerCase().replaceAll("_", " ")}{item.active ? "" : " · reversed when source transaction was removed"}</p></div><div className="flex items-center gap-2"><strong className="font-display text-sm tabular-nums">{money(item.amount)}</strong>{item.type === "MANUAL" && !contributions.some((entry) => entry.reversesContributionId === item.id) && <button className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => void act(() => financeApi.reverseGoalContribution(selected.id, item.id), "Contribution reversed.")}>Reverse</button>}</div></div>)}</div>}
            </div>
          </>}
        </section>
      </section>
    </div>
  </AuthenticatedShell>;
}
