# Emergency product sprint backlog

Deadline: **22 November 2026**. Estimates are engineering complexity (S/M/L), not calendar-day promises. Priorities: **P0** blocks a truthful/reliable live demo; **P1** materially improves correctness/demo; **P2** follow-on. No implementation has been performed as part of this audit.

## Recommended order

| Rank | Task | Priority | Complexity |
|---:|---|---|---|
| 1 | Establish a reproducible demo environment and verify DB, migrations, auth and browser session end-to-end | P0 | L |
| 2 | Correct dashboard income aggregation and snapshot semantics; add finance aggregation regression tests | P0 | M |
| 3 | Add deterministic financial calculation module and reference tests for EMI, SIP, CAGR and FD | P0 | M |
| 4 | Harden/demo-label Monte Carlo assumptions and add deterministic sampler + boundary tests | P1 | M |
| 5 | Make CI cover API typecheck, unit tests, web tests/build, Prisma schema validation | P1 | M |

## Tasks

### 1. Reproducible demo environment and end-to-end smoke path

- **Priority:** P0
- **Dependencies:** Database owner/environment access; clarify which seeded demo account and DB are approved for non-mutating/isolated demo use. Do not apply migrations to production. Create isolated disposable DB or staging database for migration testing.
- **Files involved:** `README.md`, `.env.example` (new), `apps/api/src/index.ts`, `apps/api/src/lib/prisma.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/routes/index.tsx`, `prisma.config.ts`, new smoke test/workflow files.
- **Acceptance criteria:** Document exact startup commands and required env keys; health/readiness endpoints distinguish API alive from DB ready; run signup/login/refresh/logout and one read-only dashboard request against isolated DB; confirm CORS/cookie attributes in browser; capture console/network success for `/`, `/login`, `/investments`, `/news`; diagnose or close prior `Vite Error: aborted`; record actual migration state without applying migrations to production.
- **Required tests:** API health/readiness test; auth HTTP integration tests with isolated DB; browser smoke test for session restore and API failure/retry; migration status in isolated environment.
- **Estimated complexity:** L.

### 2. Fix dashboard income aggregation and snapshot semantics

- **Priority:** P0
- **Dependencies:** Agree whether recurring income and transaction income represent separate/additive sources; define month-close policy for net-worth snapshots.
- **Files involved:** `apps/api/src/services/dashboardService.ts`, new `apps/api/src/test/dashboardService.test.ts`, possibly `prisma/schema.prisma` / new migration if immutable snapshots are required, dashboard copy/components.
- **Acceptance criteria:** Transaction income is never silently dropped when recurring income exists; deduplication/aggregation semantics are documented and implemented; snapshot records cannot be mistaken for month-end close if written on page view; missing values and zero-income/zero-expense states have defined outputs; stock ledger exclusion is visible wherever net worth is shown.
- **Required tests:** recurring only, transaction only, both, zero income, expenses > income, effective date boundaries/timezone, current/prior snapshot timing, user isolation. If snapshot schema changes, migration tested only on disposable DB.
- **Estimated complexity:** M (L if changing historical snapshot schema).

### 3. Financial calculator core with independent reference fixtures

- **Priority:** P0
- **Dependencies:** Product decision on displayed conventions (SIP month-end vs beginning; annual nominal/effective rate; FD compounding frequency; rounding currency precision).
- **Files involved:** New `apps/api/src/services/financeCalculations.ts` or shared calculation package; `apps/api/src/controllers/financeController.ts`; new `apps/api/src/test/financeCalculations.test.ts`; dashboard calculator UI/route; optionally `FEATURE_MATRIX.md` after implementation.
- **Acceptance criteria:** Pure functions for EMI, SIP future value, CAGR and FD maturity; explicit units and timing convention; reject nonfinite/negative/invalid inputs; stable behavior at zero rate and boundary tenures; results match independently calculated hand/reference fixtures within stated tolerance; UI labels assumptions and currency; no XIRR/risk claims unless separately implemented.
- **Required tests:** EMI 0% and known amortization fixture; SIP zero-rate ordinary annuity and annuity timing; CAGR 1-year and multi-year; FD annual and selected compounding frequency; invalid/overflow/zero-duration cases; reference computation documented in test.
- **Estimated complexity:** M.

### 4. Deterministic and bounded Monte Carlo projection

- **Priority:** P1
- **Dependencies:** Decide RNG seed/replay interface; choose whether correlations are explicit parameters or model limitation remains disclosed; define negative wealth handling.
- **Files involved:** `apps/web/src/lib/investment-simulation.ts`, `apps/web/src/components/investment-simulator.tsx`, new `apps/web/src/test/investment-simulation.test.ts`, `apps/web/package.json`.
- **Acceptance criteria:** Inject seeded random source; validate allocation sums/ranges, finite horizon/SIP and bounded work; zero-return deterministic case yields contributions at month-end; percentiles sorted/nonnegative under defined portfolio model; UI exposes simulation assumptions and repeatability appropriately; no test-runner/network dependency is silently required.
- **Required tests:** seeded same-input repeatability, zero-return SIP reference, zero contribution, all-cash allocation/weights, 1-year boundaries, invalid direct API inputs, percentile ordering and numerical finite checks.
- **Estimated complexity:** M.

### 5. Expand CI to project-wide checks

- **Priority:** P1
- **Dependencies:** Add or confirm web test runner/dependencies; settle API TS config and Prisma client generation workflow.
- **Files involved:** `.github/workflows/web-build.yml`, root `package.json`, `apps/web/package.json`, `tsconfig.json`, optionally `apps/web/tsconfig.json`.
- **Acceptance criteria:** CI runs reproducible installs, API TypeScript compile, `npm run test:api`, web tests, web production build, and `prisma validate`; failure in any required check blocks CI; no database migration is run in CI unless against disposable test DB.
- **Required tests:** Verify workflow on clean CI runner; introduce a deliberately failing check in a temporary branch or validate job commands locally.
- **Estimated complexity:** M.

### 6. Security and auth flow hardening

- **Priority:** P1
- **Dependencies:** Decide password hashing policy, deployment origin list, token TTL, refresh reuse handling and rate-limit requirements.
- **Files involved:** `apps/api/src/services/authService.ts`, `apps/api/src/controllers/authController.ts`, `apps/api/src/middleware/authMiddleware.ts`, `apps/api/src/index.ts`, `apps/api/src/utils/jwt.ts`, auth integration tests, `README.md`.
- **Acceptance criteria:** Documentation matches actual hashing/encryption controls; explicit Bearer scheme validation; rate limits for credential endpoints; duplicate signup maps to 409; refresh rotation is transactionally/concurrently safe and reuse behavior is defined; cookie/CORS production origin is configured safely; secret minimum/required env validated at startup.
- **Required tests:** Invalid/missing credentials, duplicate email, expiration, concurrent refresh, revoked/reused token, CORS/cookie attributes, rate limits, authorization isolation.
- **Estimated complexity:** L.

### 7. Stock ledger valuation and portfolio metrics (defer if no price data)

- **Priority:** P2
- **Dependencies:** Approved market-data source, timestamp/freshness policy, splits/dividends/corporate action treatment, definition of performance and tax scope.
- **Files involved:** `apps/api/src/services/stockTradeService.ts`, `apps/api/src/services/stockLedger.ts`, `apps/web/src/routes/investments.tsx`, `prisma/schema.prisma` and migrations, new valuation/performance tests.
- **Acceptance criteria:** Explicitly distinguish cost basis, realized P&L, unrealized P&L and market value; reject/mark stale quotes; define total-return vs price-return series; do not label FIFO outputs as tax advice; only expose risk metrics after validated return series exist.
- **Required tests:** Price staleness, splits/dividend treatment, cash flows, time-weighted/XIRR fixtures, volatility annualization, drawdown and tail metric fixtures.
- **Estimated complexity:** L.

### 8. Operational news source ingestion

- **Priority:** P2
- **Dependencies:** Source terms/access approval, adapter implementation, scheduler/worker host, source seed strategy and monitoring owner.
- **Files involved:** `apps/api/src/services/news/adapterRegistry.ts`, `sourceRegistry.ts`, new adapter/worker modules, server deployment config, news tests.
- **Acceptance criteria:** At least one explicitly enabled lawful source is registered and scheduled; ingestion is idempotent and monitored; source provenance and failure status visible; fixture and integration tests validate adapter parsing and event pipeline; no synthetic fixture content appears as market news.
- **Required tests:** Adapter contract fixtures, retries/rate limits, duplicate idempotency, malformed feed handling, event provenance, worker restart recovery.
- **Estimated complexity:** L.

## Demo scope recommendation

For the deadline, demo authenticated dashboard CRUD, a hand-entered completed stock trade with FIFO cost basis, and the illustrative Monte Carlo only after documenting its conditional assumptions. Present the existing EMI only as a stored-loan estimate after adding regression tests. Do not claim XIRR, CAGR/FD calculators, market-valued portfolio return, risk metrics, automated investing/payments, or live news ingestion until the corresponding backlog acceptance criteria are met.
