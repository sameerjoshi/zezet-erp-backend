-- Treasury (ADR 0007): bank/cash accounts + categorized single-entry ledger.

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('bank', 'cash');
CREATE TYPE "TxDirection" AS ENUM ('inflow', 'outflow');
CREATE TYPE "TxCategory" AS ENUM ('client_payment', 'investment', 'loan', 'fuel', 'salary', 'maintenance', 'toll', 'insurance', 'tax', 'general', 'transfer', 'other');

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL DEFAULT 'bank',
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "direction" "TxDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "category" "TxCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "truckId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
