# Track B integration notes for Track A

Track B dashboard and management work is being added alongside the existing API and the existing authenticated home UI. The existing login, signup, and visual theme are retained. The main dashboard is appended below the signed-in card.

## Shared database changes

- `User.creditScore` is added for the user-entered, display-only score.
- `MonthlySnapshot` stores one monthly net-worth point per user. It supports a real month-over-month comparison after a prior month has been captured. A first-time user sees no change value until a prior monthly point exists.
- Migration: `prisma/migrations/20261010120000_track_b_dashboard/migration.sql`.
- Regenerate Prisma Client and apply this migration before using `/finance/dashboard` or credit-score endpoints.
- Please coordinate this migration through the schema gatekeeper. The migration only adds the nullable score and snapshot table; it does not rename existing tables or columns.

## Existing Track A surfaces consumed

- The dashboard reads `Investment.currentValue`, `Investment.investedAmount`, and `Investment.category` to show investment value and P&L, and includes current investment value in assets/net worth. No investment routes or simulator components are changed.
- If Track A changes the investment schema or encrypts those amounts, update `apps/api/src/services/dashboardService.ts` to use the new read/decryption boundary. The same applies to `Account.balance`, `Loan.outstanding`, `Loan.emiAmount`, and transaction amounts used in totals and the health score.
- No Track A route files, auth services, or auth middleware are edited. The new protected endpoints are grouped under `/finance`.

## Calculator handoff

- Goal projections currently calculate the required monthly contribution as the remaining goal amount divided by months remaining, which assumes 0% return. The plan assigns the shared SIP calculator package to Track A; that package is not present in this repository yet.
- Once Track A exposes `sipFutureValue` (or a monthly contribution inverse helper) in a stable importable package, replace the 0% helper in `apps/api/src/services/dashboardService.ts` and update the dashboard label. No shared package contract was changed here.

## Boundaries and assumptions

- Net worth is accounts plus current investments minus recorded loan outstanding. There are no separate asset/liability models in the current schema, so this dashboard uses the repository's existing `Account`, `Investment`, and `Loan` records.
- Monthly income uses active income sources normalized to monthly; if none are present, it falls back to recorded income transactions. Expenses are current-month expense transactions.
- The financial health score follows the plan's 40/30/30 components for savings rate, debt-to-income, and emergency-fund coverage.
- Subscription suggestions come from bill category `SUBSCRIPTION`; transaction pattern detection only flags repeated descriptions/categories with amounts within 20% and dates 25–35 days apart. They are suggestions, not automatic bill creation.
- The financial news feed remains the plan's stated cut candidate and has no Track B ownership, source API, or credentials defined in the repository.
