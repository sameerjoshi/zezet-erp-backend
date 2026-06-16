-- Treasury auto-posting (ADR 0007 follow-up): source tracking + default account.

-- CreateEnum
CREATE TYPE "TxSource" AS ENUM ('manual', 'invoice', 'payroll', 'cost');

-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Transaction" ADD COLUMN "sourceType" "TxSource" NOT NULL DEFAULT 'manual';
ALTER TABLE "Transaction" ADD COLUMN "sourceId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_sourceType_sourceId_idx" ON "Transaction"("sourceType", "sourceId");
