import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AuthenticatedShell } from "@/components/authenticated-shell";
import { financeApi, restoreAccessToken } from "@/lib/api";
import { PageIntro } from "@/components/ui/product";

const inputClass = "field-input";
const buttonClass = "rounded-md bg-primary px-4 py-2.5 font-ui text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";
const currency = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);
const percent = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);
const numberValue = (values: FormData, name: string) => Number(values.get(name));

export const Route = createFileRoute("/calculators")({
  head: () => ({ meta: [{ title: "Financial Calculators · FinLitter" }] }),
  component: CalculatorsPage,
});

function CalculatorsPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    restoreAccessToken().then((hasSession) => {
      if (!active) return;
      if (hasSession) setReady(true);
      else void navigate({ to: "/login", replace: true });
    }).catch(() => {
      if (active) setSessionError("Could not connect to the finance service. Check the backend, then retry.");
    });
    return () => { active = false; };
  }, [navigate, retry]);

  if (!ready && !sessionError) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><p role="status" className="text-sm text-muted-foreground">Restoring your session…</p></div>;
  }
  if (sessionError) {
    return <div className="flex min-h-screen items-center justify-center bg-background px-4"><section className="surface-panel w-full max-w-md rounded-lg p-6 text-center"><h1 className="font-display text-xl font-bold">Calculators unavailable</h1><p role="alert" className="mt-3 text-sm text-muted-foreground">{sessionError}</p><button className={`${buttonClass} mt-5 w-full`} onClick={() => { setSessionError(""); setRetry((count) => count + 1); }}>Retry connection</button></section></div>;
  }

  return (
    <AuthenticatedShell active="calculators">
      <div className="calculator-page space-y-7 pb-10">
        <PageIntro eyebrow="LEARN THE NUMBERS" title="Financial calculators" description="Estimate loan payments, investment growth and fixed deposit maturity. Each result comes from the finance service and shows the assumptions used." />

        <div className="grid gap-5 lg:grid-cols-2">
          <CalculatorCard
            title="EMI calculator"
            description="Estimate a level monthly loan instalment."
            assumption="Nominal annual interest divided by 12; payments at each month end. Fees and insurance are excluded."
            calculate={(values) => financeApi.calculateEmi({ principal: numberValue(values, "principal"), annualRatePercent: numberValue(values, "rate"), tenureMonths: numberValue(values, "months") })}
            renderResult={({ monthlyPayment }, values) => {
              const principal = numberValue(values, "principal");
              const months = numberValue(values, "months");
              const totalPayment = monthlyPayment * months;
              return <ResultGrid items={[
                ["Monthly instalment", currency(monthlyPayment), true],
                ["Total payment", currency(totalPayment)],
                ["Total interest", currency(totalPayment - principal)],
              ]} />;
            }}
          >
            <NumberField label="Loan principal (₹)" name="principal" defaultValue="1000000" min="0.01" step="0.01" />
            <NumberField label="Annual interest rate (%)" name="rate" defaultValue="8.5" min="0" step="0.01" />
            <NumberField label="Tenure (months)" name="months" defaultValue="240" min="1" max="1200" step="1" />
          </CalculatorCard>

          <CalculatorCard
            title="SIP future value"
            description="Estimate the value of regular monthly investments."
            assumption="Expected annual return is an effective annual rate, converted to an equivalent monthly rate. Contributions are made at the selected time each month; taxes and fees are excluded."
            calculate={(values) => financeApi.calculateSip({ monthlyPayment: numberValue(values, "payment"), annualEffectiveRatePercent: numberValue(values, "rate"), tenureMonths: numberValue(values, "months"), timing: String(values.get("timing")) as "MONTH_END" | "BEGINNING_OF_MONTH" })}
            renderResult={({ futureValue }, values) => {
              const invested = numberValue(values, "payment") * numberValue(values, "months");
              return <ResultGrid items={[
                ["Invested amount", currency(invested)],
                ["Estimated maturity value", currency(futureValue), true],
                ["Estimated gains", currency(futureValue - invested)],
              ]} />;
            }}
          >
            <NumberField label="Monthly investment (₹)" name="payment" defaultValue="5000" min="0" step="0.01" />
            <NumberField label="Expected annual return (%)" name="rate" defaultValue="12" min="-99.99" step="0.01" />
            <NumberField label="Duration (months)" name="months" defaultValue="120" min="1" max="1200" step="1" />
            <label className="grid gap-1.5"><span className="field-label">Payment timing</span><select className={inputClass} name="timing" defaultValue="MONTH_END"><option value="MONTH_END">Month end</option><option value="BEGINNING_OF_MONTH">Beginning of month</option></select></label>
          </CalculatorCard>

          <CalculatorCard
            title="CAGR calculator"
            description="Measure annualized compound growth between two values."
            assumption="Uses the initial value, final value and elapsed duration in years. CAGR does not account for deposits, withdrawals, taxes or fees during the period."
            calculate={(values) => financeApi.calculateCagr({ beginningValue: numberValue(values, "beginning"), endingValue: numberValue(values, "ending"), years: numberValue(values, "years") })}
            renderResult={({ annualizedReturn }) => <ResultGrid items={[["Annualized growth rate", percent(annualizedReturn), true]]} />}
          >
            <NumberField label="Initial value (₹)" name="beginning" defaultValue="100000" min="0.01" step="0.01" />
            <NumberField label="Final value (₹)" name="ending" defaultValue="150000" min="0" step="0.01" />
            <NumberField label="Duration (years)" name="years" defaultValue="5" min="0.01" max="1000" step="any" />
          </CalculatorCard>

          <CalculatorCard
            title="Fixed deposit maturity"
            description="Estimate cumulative fixed deposit growth."
            assumption="Nominal annual interest is compounded at the selected frequency for the stated duration. Assumes reinvested interest; tax and premature withdrawal penalties are excluded."
            calculate={(values) => financeApi.calculateFd({ principal: numberValue(values, "principal"), annualNominalRatePercent: numberValue(values, "rate"), years: numberValue(values, "years"), compoundingFrequency: numberValue(values, "frequency") })}
            renderResult={({ maturityValue }, values) => {
              const principal = numberValue(values, "principal");
              return <ResultGrid items={[
                ["Maturity value", currency(maturityValue), true],
                ["Interest earned", currency(maturityValue - principal)],
              ]} />;
            }}
          >
            <NumberField label="Deposit principal (₹)" name="principal" defaultValue="100000" min="0.01" step="0.01" />
            <NumberField label="Annual interest rate (%)" name="rate" defaultValue="7" min="0" step="0.01" />
            <NumberField label="Tenure (years)" name="years" defaultValue="5" min="0.01" max="1000" step="any" />
            <label className="grid gap-1.5"><span className="field-label">Compounding frequency</span><select className={inputClass} name="frequency" defaultValue="4"><option value="1">Annually</option><option value="2">Half-yearly</option><option value="4">Quarterly</option><option value="12">Monthly</option><option value="365">Daily</option></select></label>
          </CalculatorCard>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">These are estimates under the stated conventions. Actual lender, investment and deposit terms may differ. Results are not financial advice.</p>
      </div>
    </AuthenticatedShell>
  );
}

type CalculatorCardProps<T> = {
  title: string;
  description: string;
  assumption: string;
  calculate: (values: FormData) => Promise<T>;
  renderResult: (result: T, values: FormData) => ReactNode;
  children: ReactNode;
};

function CalculatorCard<T>({ title, description, assumption, calculate, renderResult, children }: CalculatorCardProps<T>) {
  const headingId = `${title.toLowerCase().replace(/\s+/g, "-")}-heading`;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ value: T; inputs: FormData } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const value = await calculate(values);
      setResult({ value, inputs: values });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not calculate this estimate. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="surface-panel grid content-start gap-5 rounded-2xl p-5 sm:p-6" aria-labelledby={headingId}>
      <header>
        <h2 id={headingId} className="font-display text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        {children}
        <button className={`${buttonClass} sm:col-span-2`} type="submit" disabled={loading}>
          {loading ? "Calculating…" : "Calculate estimate"}
        </button>
      </form>
      <div className="min-h-20" aria-live="polite">
        {loading ? <p role="status" className="text-sm text-muted-foreground">Requesting calculation…</p> : null}
        {error ? <div className="rounded-lg border border-loss/40 bg-loss/5 p-3 text-sm text-loss" role="alert"><p>{error}</p><p className="mt-1 text-xs">Check the inputs or connection and submit again.</p></div> : null}
        {!loading && !error && result ? <div className="space-y-3"><h3 className="field-label">Estimate</h3>{renderResult(result.value, result.inputs)}</div> : null}
        {!loading && !error && !result ? <p className="text-sm text-muted-foreground">Enter your assumptions and calculate to see an estimate.</p> : null}
      </div>
      <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Assumptions: </span>{assumption}</p>
    </section>
  );
}

function NumberField(props: { label: string; name: string; defaultValue: string; min: string; max?: string; step: string }) {
  return <label className="grid gap-1.5"><span className="field-label">{props.label}</span><input className={inputClass} type="number" name={props.name} defaultValue={props.defaultValue} min={props.min} max={props.max} step={props.step} required /></label>;
}

function ResultGrid({ items }: { items: Array<[string, string, boolean?]> }) {
  return <dl className="grid gap-2 sm:grid-cols-2">{items.map(([label, value, primary]) => (
    <div key={label} className={`rounded-xl p-3 ${primary ? "bg-primary/10 sm:col-span-2" : "bg-secondary/40"}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 font-display font-semibold tabular-nums ${primary ? "text-xl text-primary" : "text-base"}`}>{value}</dd>
    </div>
  ))}</dl>;
}
