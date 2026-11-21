CREATE TYPE "GoalCategory" AS ENUM ('SAVINGS', 'PURCHASE', 'EMERGENCY_FUND', 'DEBT_REPAYMENT', 'INVESTMENT');
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "GoalContributionFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY');
CREATE TYPE "GoalContributionType" AS ENUM ('MANUAL', 'TRANSACTION', 'REVERSAL');

ALTER TABLE "Budget"
  ADD COLUMN "category" "GoalCategory" NOT NULL DEFAULT 'SAVINGS',
  ADD COLUMN "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "startingBalance" DECIMAL(38,12) NOT NULL DEFAULT 0,
  ADD COLUMN "contributionFrequency" "GoalContributionFrequency" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "plannedContributionAmount" DECIMAL(38,12),
  ADD COLUMN "linkedLoanId" TEXT,
  ADD COLUMN "includePortfolio" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "portfolioOwnerId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Budget" SET "startingBalance" = "currentAmount";
CREATE UNIQUE INDEX "Budget_userId_id_key" ON "Budget"("userId", "id");
CREATE INDEX "Budget_userId_status_targetDate_idx" ON "Budget"("userId", "status", "targetDate");
CREATE UNIQUE INDEX "Budget_userId_linkedLoanId_key" ON "Budget"("userId", "linkedLoanId");
CREATE UNIQUE INDEX "Budget_portfolioOwnerId_key" ON "Budget"("portfolioOwnerId");

CREATE TABLE "GoalContribution" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "amount" DECIMAL(38,12) NOT NULL,
  "type" "GoalContributionType" NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "note" VARCHAR(300),
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "sourceTransactionId" TEXT,
  "reversesContributionId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoalContribution_amount_nonzero" CHECK ("amount" <> 0),
  CONSTRAINT "GoalContribution_type_consistent" CHECK (
    ("type" = 'REVERSAL' AND "amount" < 0 AND "reversesContributionId" IS NOT NULL)
    OR ("type" <> 'REVERSAL' AND "amount" > 0 AND "reversesContributionId" IS NULL)
  ),
  CONSTRAINT "GoalContribution_source_consistent" CHECK (
    ("type" = 'TRANSACTION' AND "sourceTransactionId" IS NOT NULL)
    OR ("type" <> 'TRANSACTION' AND "sourceTransactionId" IS NULL)
  )
);

CREATE UNIQUE INDEX "GoalContribution_userId_idempotencyKey_key" ON "GoalContribution"("userId", "idempotencyKey");
CREATE UNIQUE INDEX "GoalContribution_sourceTransactionId_key" ON "GoalContribution"("sourceTransactionId");
CREATE UNIQUE INDEX "GoalContribution_reversesContributionId_key" ON "GoalContribution"("reversesContributionId");
CREATE INDEX "GoalContribution_userId_budgetId_effectiveAt_idx" ON "GoalContribution"("userId", "budgetId", "effectiveAt");

ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_userId_budgetId_fkey"
  FOREIGN KEY ("userId", "budgetId") REFERENCES "Budget"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_reversesContributionId_fkey"
  FOREIGN KEY ("reversesContributionId") REFERENCES "GoalContribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;




