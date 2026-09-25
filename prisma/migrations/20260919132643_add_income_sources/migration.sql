-- CreateEnum
CREATE TYPE "IncomeSourceType" AS ENUM ('SALARY', 'FREELANCE', 'RENTAL', 'OTHER');

-- CreateEnum
CREATE TYPE "IncomeFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'ANNUAL');

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "IncomeSourceType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "frequency" "IncomeFrequency" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeSource_userId_idx" ON "IncomeSource"("userId");

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
