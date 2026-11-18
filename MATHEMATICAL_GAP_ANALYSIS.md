# Mathematical gap analysis

Scope is limited to calculations found in the repository. The implementation contains no independent financial calculation test suite. Formula checks below are code inspection and elementary independent reference identities, not claims that runtime outputs were numerically certified against a library or external oracle.

## Implemented calculations

### Loan EMI

`apps/api/src/controllers/financeController.ts` computes monthly rate `r = annualPercent / 1200`, number of payments `n = tenureMonths`, and principal `P`. For `r = 0`, EMI is `P/n`; otherwise:

`EMI = P × r × (1+r)^n / ((1+r)^n − 1)`.

This is the standard fixed-payment amortizing loan formula under a nominal annual interest rate divided into 12 equal monthly periods, payments at month end, unchanged rate, and no fees/insurance. Zero-rate branch is mathematically correct. Independent identity: at 0% interest, total paid is exactly principal; at positive `r`, the present value of the level payment stream equals `P`. No automated numeric fixtures exist. Controller accepts positive principal, rate 0–100%, and integer 1–600 months. Risks: no finite/overflow checks beyond Zod number; `100%` annual over long tenures can overflow; update can set tenure/principal/rate separately and recomputes EMI, while UI only exposes outstanding and rate. Outstanding is not automatically amortized and may not match EMI history. Estimate complexity: add stable helper, tests at zero/known cases, finite guards, explicit convention label.

### Dashboard income, expenses, savings rate, balances and ratios

`dashboardService.ts` converts weekly source income to `amount × 52/12`, annual to `/12`, monthly unchanged; filters active and currently effective sources. Current-month transaction expense/income is a calendar month in UTC. `totalIncome = recurringIncome || transactionIncome`; savings rate is `(totalIncome − currentMonthExpenses)/totalIncome × 100`. Assets sum account balances + legacy Investment.currentValue; liabilities sum Loan.outstanding; net worth is assets minus liabilities. Debt-to-income is sum of stored EMI / totalIncome × 100. Emergency-fund months is liquid checking/savings/salary account balances / current-month expenses. A heuristic health score clamps savings rate, DTI and fund months to component bands (40/30/30 points).

Assumptions/limitations: recurring source amounts treated as gross monthly-equivalent cash flow regardless of one-off timing; all transaction amounts positive magnitudes with type carrying sign; no account balance reconciliation from transactions; empty income/expense conditions return nulls; monthly expense denominator is a single observed month. Critical arithmetic discrepancy: if any recurring source yields positive income, transaction income is ignored rather than added, so salary transactions can disappear from the income total; conversely fallback is transaction income only when recurring total is zero. Expense can exceed income, producing negative savings rate later clamped to zero for score. Debt-to-income uses contractual EMI even if loans are nearly paid and no income is recorded yields null. Emergency fund ratio fluctuates with current-month spend and is null if no spend. These are dashboard indicators, not standardized financial health measures.

### Monthly snapshot and budget progress

Snapshot stores the current point estimate under `(userId, UTC year, month)` on every dashboard request; later requests overwrite values and `capturedAt`. `netWorthChange` compares against prior calendar month snapshot if present. A current-month snapshot is not a true monthly close; missing prior visit means missing comparison and within-month edits rewrite history. Budget progress is `min(100, currentAmount/max(1,targetAmount) × 100)`, remaining gap is nonnegative, time is months `(targetDate-now)/(30.4375 days)` floored to 1, required saving is gap/months. No check for already-past target, target amount under 1 currency unit, or overfunded display beyond 100%; no link between goal contributions and cash flow. These are planning estimates.

### FIFO stock holdings and realized P&L

`stockLedger.ts` orders active trades by trade date, creation time, ID. Buy lot basis is `quantity × executionPrice + fees`; sells consume earliest lots, prorate each lot's decimal cost, and realize `sale quantity × price − sell fees − matched basis`. A reversal filters the reversed original and itself from the active ledger. Fees and prices use Prisma Decimal, quantity is integer shares, output cost values are rounded to 2 or 6 decimal places. Tests independently assert a fixture: buy 2 at 100.25 + 1 fee, buy 3 at 120 + 1.50 fee, sell 3 at 130 − 2 fee yields remaining cost ₹241.00 and realized P&L ₹66.00; hand calculation agrees. Oversell throws; tested. This is cost accounting, not mark-to-market return, tax reporting, corporate-action adjusted basis, or IRR. Fractional shares are rejected by integer quantity. FIFO is one convention and may not match jurisdiction-specific tax treatment. Long reversal chains, multi-currency and same-day ordering convention are not comprehensively tested.

## Monte Carlo model audit

`apps/web/src/lib/investment-simulation.ts` defines fixed annual arithmetic growth assumptions and annual volatilities:

| Asset | annual growth input | annual volatility input |
|---|---:|---:|
| Equity | 12% | 15% |
| Debt | 7% | 3% |
| Gold | 8% | 10% |

For each asset and month it draws independent standard normal `Z` and samples `R = exp((ln(1+CAGR) − σ²/2)/12 + σ/√12 × Z) − 1`. Weighted portfolio simple return is sum of allocation weights times each asset's sampled return. Portfolio balance is updated `V ← V(1+Rportfolio) + SIP`; therefore contributions occur at month end and do not earn return until the next month. It simulates 1,000 paths and linearly interpolates empirical P10/P50/P90 at year ends.

The lognormal conversion is internally consistent if CAGR inputs mean annual expected arithmetic return under lognormal assumptions: the monthly expected gross return is `(1+CAGR)^(1/12)`, and annualized variance is approximately supplied σ². Independent reference cases: with all weights and SIP zero, all percentiles should be zero; with monthly SIP and returns zero, year `t` value should be `12 × SIP × t` (this is a formula identity, but implementation has no deterministic injection/test). These cases are not encoded as tests.

Material gaps: `Math.random` prevents deterministic replay; no explicit RNG seed, confidence intervals, convergence check or testable injected sampler; the three assets' innovations are sampled independently, imposing zero correlation while real assets co-move; portfolio weighted returns can be negative below −100% in aggregate in extreme samples even when a constituent lognormal gross return cannot, yielding nonsensical negative portfolio balances; no rebalance/reinvestment drift convention is disclosed; 1,000 paths give noisy tails; no inflation, tax, fees, contribution escalation, sequence scenario or historical calibration; changing inputs recalculates the whole projection. Inputs are clamped in UI, but exported function accepts invalid allocations/years/SIP and has no numerical guards. P10/P90 should be described as simulated percentiles conditional on assumptions, not confidence bounds or guarantees.

## Requested calculator / risk metrics not implemented

| Metric | Standard form / convention to specify | Required data and edge cases |
|---|---|---|
| SIP future value | Ordinary annuity: `S × ((1+i)^n−1)/i` for month-end contribution; annuity due multiplies by `(1+i)`; define monthly rate conversion | `i=0`, `n=0`, start/end timing, return convention, rounding. No standalone implementation. |
| CAGR | `(ending / beginning)^(1/years) − 1` for positive values | Positive starting value; exact elapsed days vs calendar years; corporate actions/cash flows invalidate naïve CAGR. Missing. |
| XIRR | Solve `Σ CF_i/(1+r)^((date_i−date_0)/365)=0` with explicit day-count convention and root policy | At least one positive/negative cash flow, irregular dates, multiple/no roots, `r≤−1`, convergence/bracketing and duplicate dates. Missing. |
| FD maturity | Depends on product convention; e.g. quarterly compounding `P(1+r/4)^(4t)` or cumulative payout variants | Nominal/effective rate, compounding frequency, tenure units, tax/penalty/rounding. Missing. |
| Portfolio return | Time-weighted return (chain-linked subperiod returns) or money-weighted XIRR; must label choice | Valuation series, external flows, distributions, fees, currency, missing/stale prices. Missing. |
| Volatility | Sample standard deviation of periodic returns, annualized by `√periods/year` | Frequency, sample/population estimator, missing observations, total vs excess returns. Missing. |
| Sharpe | `(annual portfolio return − annual risk-free rate)/annualized volatility` with matched period conventions | Risk-free series/rate, annualization and zero-volatility case. Missing. |
| Drawdown | `V_t / max_{s≤t} V_s − 1`; maximum is minimum drawdown | Consistent total-return series, external flows adjusted, inception/initial peak handling. Missing. |
| VaR / CVaR | Quantile loss and conditional mean tail loss at stated horizon/confidence/model | Return/loss sign convention, historical/parametric/simulated estimator, finite sample/tail interpolation. Missing. |

No external calculation library/oracle is declared. The EMI and FIFO examples above are independently hand-checked identities/fixtures only. The projection has no deterministic cross-check. Do not represent these metrics as implemented or validated in a demo.
