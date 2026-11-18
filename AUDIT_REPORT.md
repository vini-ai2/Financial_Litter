# FinLitter repository audit

**Audit date:** 18 November 2026  
**Scope:** Repository code, configuration, migrations, and checks runnable in this workspace. No application source files were edited, no migrations were applied, and no production data was changed. The four audit deliverables are the only intended additions.

## Executive summary

FinLitter is a React 19 / TanStack Start / Vite frontend, an Express 5 API, and a Prisma/PostgreSQL data layer. The browser has overview, login, signup, investments and news pages. The API exposes authentication, user finance CRUD, stock ledger, and sourced-news endpoints. The web production build succeeded and the configured API suite passed 29/29 tests. Prisma schema validation succeeded.

The application is **not yet demonstrably ready for an end-to-end live financial demo**. No standalone SIP, XIRR, CAGR, FD, or portfolio-risk calculator is implemented. The only investment projection is a client-side Monte Carlo tool. Several dashboard totals are useful estimates but use simplifying conventions and do not include the newer stock ledger. Browser console/network behavior, authenticated database-backed flows, migration deployment state, and remote DB connectivity could not be verified in this audit. The existing `test` script is deliberately a failing placeholder, web tests have no package test script, and CI only builds the web app.

## Repository architecture and routes

### Frontend

- `apps/web`: React 19, TanStack Router / Start, Vite 7, Tailwind 4, Recharts, TanStack Query. File-based route tree is in `apps/web/src/routes` with generated `routeTree.gen.ts`.
- Routes: `/` (authenticated financial overview), `/login`, `/signup`, `/investments`, `/news`, `/news/$eventId`, plus the router's not-found behavior. `apps/web/src/test/app-routing.test.tsx` only checks that root and not-found routes mount.
- API client and in-memory access-token handling: `apps/web/src/lib/api.ts`; auth context exists. Dashboard and investment pages call protected APIs. The simulator runs in-browser and does not persist runs.
- A root-mounted `InvestmentSimulator` is presented on the dashboard; investments page is a manual completed-trade ledger, not brokerage connectivity.

### Backend / endpoints

Express app at `apps/api/src/index.ts` listens on fixed port 3000, parses JSON/cookies, permits credentialed CORS from localhost and 127.0.0.1 Vite origins, and mounts:

| Prefix | Routes | Access |
|---|---|---|
| `/` | liveness text | public |
| `/auth` | `GET /ping`, `POST /signup`, `/login`, `/refresh`, `/logout`, `GET /protected` | mixed; protected route uses JWT, refresh/logout use cookie |
| `/accounts` | GET/POST `/`, GET `/:id`, PUT/DELETE `/:id` | JWT |
| `/income-sources` | GET/POST `/`, GET `/:id`, PUT/DELETE `/:id` | JWT |
| `/transactions` | GET/POST `/`, GET `/:id`, PUT/DELETE `/:id` | JWT |
| `/finance` | GET `/dashboard`; CRUD `/loans`, `/budgets`, `/bills`; GET/PUT `/credit-score` | JWT |
| `/investments/stocks` | GET `/holdings`, GET/POST `/transactions`, POST `/transactions/:id/reversals` | JWT |
| `/news` | GET `/events`, `/events/:id`, `/filters`, `/preferences`; PUT `/preferences` | JWT |

Account/income/transaction CRUD is implemented in controllers and services; finance endpoints use Prisma directly in `financeController.ts`; dashboard aggregation is in `dashboardService.ts`. User ownership is applied in most reads/updates/deletes. API integration tests against a real HTTP server and database were not found.

### Persistence and migrations

Prisma schema is `prisma/schema.prisma`, PostgreSQL configured by `prisma.config.ts` / `DATABASE_URL`. Models cover users, sessions, accounts, transactions, income sources, loans, investments, stock trades, bills, budgets, monthly snapshots, and news sources/documents/failures, entities/aliases/identifiers/mentions, events/revisions/evidence/documents/entities, and user preferences.

Nine checked-in migration directories are present: initial schema, income sources, session unique constraint, transaction description, Track B dashboard, stock trade ledger, news ingestion foundation, news event intelligence, and news preferences. `prisma validate` passed. `prisma migrate status` did **not** reach a database result: Prisma schema-engine process launch failed with Windows `EPERM` while attempting its connectivity check to the configured remote Neon database. Therefore applied/pending migration state and database connectivity are unknown. No migration was applied.

### Authentication / authorization

- Signup/login validate with Zod; passwords use bcrypt cost 10 (README says Argon2id, which does not match implementation).
- Access tokens are JWTs verified by `authenticate`; refresh tokens are random opaque values stored hashed in `Session`; refresh rotates by deleting old session and inserting a new one. Refresh cookie is HttpOnly, `SameSite=Strict`, path `/auth`, secure only in production, seven-day max age.
- Protected routers install authentication at router level. Stock, news, dashboard and CRUD data queries generally constrain by authenticated `userId`; tests check stock history scoping and token handling.
- No role model, fine-grained authorization, rate limiting, field-level encryption, or CSRF-specific mechanism was found. Signup duplicate-email race/error mapping and refresh rotation concurrency/reuse behavior lack integration coverage. README's AES-GCM/HKDF and rate-limiting claims are design text, not verified implementation.

### Financial features and pipeline

- Dashboard: accounts, recurring incomes, transactions, budgets, bills, loans, legacy investment aggregates, credit-score input, current-month summaries, heuristically detected recurring transactions, and monthly net-worth snapshots.
- Stock recordkeeping: immutable manual NSE/BSE trade entries, reversals, FIFO cost basis and realized P&L, exact decimal prices/fees. Not market-valued; excluded from dashboard net worth. Unit tests cover representative cases.
- Monte Carlo: browser-only 1,000-path monthly projection for equity/debt/gold, fixed assumptions, monthly contributions and P10/P50/P90 year-end chart. No seed, test, persistence, asset covariance, or historical data.
- News: registry-driven ingestion, retries, duplicate/hash checks and failures; entity alias resolution; deterministic rule-based event classification/extraction with evidence offsets, revisions and provenance; preference/filter/detail API and frontend. The repository contains these layers and meaningful isolated tests. No scheduled worker, production source adapter registration/seed, or ingestion trigger was found in the running API routes, so an operational live feed is not verified. News tests use fixtures/mocks.

## System health results

| Check | Result | Evidence / limitation |
|---|---|---|
| Production frontend build | **PASS** | `npm run build --prefix apps/web`, Vite 7.3.7 client+SSR build completed. Third-party Rollup annotation/unused-import warnings only. |
| API TypeScript compile | **NOT RUN** | Initial `npx tsc` attempted npm registry lookup (network cache miss); direct `tsc.cmd` binary is absent. Root `tsconfig.json` exists; no API build script. |
| Web TypeScript compile | **NOT RUN** | No `apps/web/tsconfig.json` or installed local `tsc.cmd` found. Build itself succeeds. |
| Prisma schema validation | **PASS** | `npx prisma validate`. |
| Migration status | **UNKNOWN / BLOCKED** | Prisma schema-engine launch failed with `EPERM` before remote DB check; no migration applied. |
| API unit suite | **PASS** | `npm run test:api`: 29 tests, 0 failures, covering stock ledger and news helpers/services/API query behavior. Mostly unit/mocked persistence; not end-to-end. |
| Web unit suite | **NOT RUN** | Routing test source imports Vitest/Testing Library, but no `test` script or web dependencies/test runner declaration was found in `apps/web/package.json`. Root `test` script intentionally exits 1. |
| API integration tests | **NOT FOUND / NOT RUN** | `.http` files are manual request examples, not automated integration tests. |
| Auth flow + database | **PARTIAL** | Middleware behavior tested; no real signup/login/refresh/logout DB integration verification. |
| Database connectivity | **UNKNOWN** | Remote probe blocked at Prisma engine launch; no successful DB query observed. |
| Browser console/network | **NOT RUN** | No live browser-backed authenticated session was available during repository checks. |
| Vite `Error: aborted` | **UNVERIFIED** | Root route has an 8-second abort timeout on `/auth/refresh` and reports an API-unavailable state; no captured browser reproduction or console/network trace to establish whether this explains the prior report. |
| CI | **PARTIAL** | `.github/workflows/web-build.yml` installs and builds web for PRs and pushes to `main`; does not typecheck, test, build API, validate Prisma, or migrate/deploy. |

## Principal risks

1. Financial calculation scope is narrower than README language suggests; no production-quality standalone calculator suite or financial math tests.
2. Monte Carlo UI is repeatable only in distribution, not run-by-run; random paths refresh on component recomputation and the weighted asset return construction omits covariance/correlation.
3. Dashboard reports income from active recurring sources **instead of** transaction income whenever any recurring monthly income is positive (`income || transactionIncome`), which can omit transaction income. Income source normalization also does not check effective windows until dashboard time.
4. Snapshot upsert is a request-time mutable monthly mark, not a fixed month-end historical snapshot; visit timing changes recorded values. Current-month expenses are flow sums; budget `currentAmount` is stored/user-updated rather than transaction-derived.
5. Stock holdings are correctly cost-based but lack market value and do not feed dashboard net worth; do not demo them as current portfolio return/performance.
6. No successful DB-backed or browser verification and migration status remains unknown.

See [FEATURE_MATRIX.md](FEATURE_MATRIX.md), [MATHEMATICAL_GAP_ANALYSIS.md](MATHEMATICAL_GAP_ANALYSIS.md), and [SPRINT_BACKLOG.md](SPRINT_BACKLOG.md) for traceable status and concrete tasks.
