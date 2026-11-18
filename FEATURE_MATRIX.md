# Feature matrix

Statuses reflect evidence in the repository and checks performed on 18 November 2026. `COMPLETE` means the scoped behavior has code plus meaningful verification; it does not imply production readiness. `PARTIAL` means a feature exists but has material omissions or incomplete verification. `BROKEN` requires an observed failure; `MISSING` means no implementation was found.

| Feature | Status | Frontend | API / service | Persistence | Tests / evidence |
|---|---|---|---|---|---|
| Frontend routes and application shell | PARTIAL | `/`, `/login`, `/signup`, `/investments`, `/news`, `/news/$eventId` | n/a | n/a | Router mount tests; production build passes, but only route mounting is asserted. |
| Web production build | COMPLETE | Vite client and SSR bundles | n/a | n/a | Build completed locally; dependency warnings only. |
| Signup/login/logout/session refresh | PARTIAL | Forms, in-memory access token, refresh on protected pages | bcrypt, JWT, hashed refresh sessions, cookie rotation | User + Session models | Middleware tests; no DB-backed auth flow test, race/reuse coverage, or browser session verification. README's Argon2id claim is inaccurate. |
| Account CRUD | PARTIAL | Dashboard add/edit/delete | Authenticated controllers/services | Account | UI/API code; no automated endpoint/service tests found. |
| Income source CRUD | PARTIAL | Dashboard forms | Authenticated controller/service | IncomeSource | Code exists; no automated feature tests found. |
| Transaction CRUD | PARTIAL | Dashboard create/edit/delete/filter | Authenticated controller/service | Transaction | Code exists; no automated feature tests found. |
| Dashboard, cash flow, net worth | PARTIAL | Overview cards, charts, sections | `getDashboard` aggregation and snapshots | Account, Investment, Loan, IncomeSource, Transaction, MonthlySnapshot, etc. | No dedicated dashboard tests; issues noted in report/math analysis. |
| Budgets / savings goals | PARTIAL | Create/update display | CRUD endpoints; required monthly saving/progress aggregation | Budget | No feature tests; stored progress not reconciled against contributions. |
| Bills / recurring detection | PARTIAL | Bill CRUD and upcoming bill display | CRUD + upcoming window; heuristic recurring transaction detection | Bill, Transaction | No feature tests; recurrence is not scheduled payment execution. |
| Loan record and EMI creation | PARTIAL | Add/edit/remove loan | EMI formula in finance controller; records principal/rate/tenure/outstanding | Loan | No EMI unit test; no separate calculator; input constraints need hardening. |
| Standalone SIP calculator | MISSING | No dedicated calculator route/formula | No endpoint/service | None | Only monthly contributions inside Monte Carlo projection. |
| XIRR / money-weighted return | MISSING | None | None | None | No implementation found. |
| CAGR calculator | MISSING | None | None | None | CAGR only serves as a Monte Carlo input assumption. |
| Fixed deposit maturity calculator | MISSING | FD account type only | No maturity calculation | Account has balance/type, no rate/tenure | No calculator/test. |
| Portfolio returns / volatility / Sharpe / drawdown / VaR / CVaR | MISSING | No performance/risk analytics | None | No return time series | Manual FIFO ledger has realized P&L, not portfolio performance/risk metrics. |
| Stock trade ledger and FIFO holdings | PARTIAL | Record completed trade, inspect holdings/history, reverse corrections | Authenticated validation, user-scoped operations, FIFO cost basis and realized P&L | StockTrade | Six tests pass for FIFO, fees, oversell, reversal, validation, middleware/scope. No quotes/market value, dividends, splits, tax lots/fees detail. |
| Monte Carlo SIP projection | PARTIAL | Allocation sliders, horizon/SIP, P10/P50/P90 chart | Client-only simulation | None | Included in successful build; no tests, deterministic seed, correlation, or backend persistence. Assumptions disclosed. |
| News ingestion | PARTIAL | No ingestion controls | Retry/dedup/hash/failure services; adapter registry | NewsSource, NewsDocument, NewsIngestionFailure | Unit tests pass for injected adapters; no scheduled worker/registered live source established. |
| News entity and event intelligence | PARTIAL | Event list/detail/provenance/preferences | Alias matching, deterministic rules, evidence, revisions | NewsEntity*, NewsEvent* | Isolated fixture-based tests pass; not ML, fact-checking, or verified production pipeline. |
| News feed and user preferences | PARTIAL | Feed/detail/filter controls | Authenticated query/filter/detail/preferences endpoints | NewsPreference and event records | Query/service tests pass; real DB/API and populated live-feed validation absent. |
| PostgreSQL connectivity / schema rollout | PARTIAL | n/a | Prisma 7 adapter config | Nine migrations present | Schema valid; status check blocked at schema engine launch `EPERM`; applied state unknown. |
| API integration suite | MISSING | n/a | Manual `.http` examples only | n/a | No automated real HTTP + DB integration test suite found. |
| Browser console/network and Vite aborted issue | PARTIAL | Root route aborts refresh after 8s, error/retry UI | API refresh handler | Session | Not reproduced or observed in browser; root can show generic API connection error. |
| CI validation | PARTIAL | Web build only | n/a | n/a | GitHub Actions builds web only; no test/typecheck/API/Prisma checks. |
| Planned commerce, auto-payments, freelancer multi-platform income, receipt split, periodic reports | MISSING | None | None | No corresponding models/services | Listed as ideas in `whatNext.md`, not implemented. |

## Route-to-data trace summary

| Route | UI responsibilities | API/data trace | Verification gap |
|---|---|---|---|
| `/` | Session restore, overview/dashboard | `/auth/refresh` then `/finance/dashboard`; CRUD panels use finance/accounts/income/transactions APIs | No authenticated browser or dashboard integration run; abort cause unknown. |
| `/login`, `/signup` | Credentials forms | `/auth/login`, `/auth/signup`; cookie and access-token flow | No actual database-backed journey verified. |
| `/investments` | Legacy aggregate investment list + completed stock trade entry/history/holdings/reversals | `/finance/dashboard`, `/investments/stocks/holdings`, `/transactions` | No valuation quotes; cannot show return on current market value. |
| `/news` | Filtered event feed and preferences | `/news/events`, `/filters`, `/preferences` | No verified live ingestion population. |
| `/news/$eventId` | Event facts, sources, evidence and revisions | `/news/events/:id` | Real sourced event rendering not observed. |
