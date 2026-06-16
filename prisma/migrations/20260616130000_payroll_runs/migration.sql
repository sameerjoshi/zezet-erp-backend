-- Payroll (ADR 0005): pay runs over periods + frozen per-trip pay lines.

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('draft', 'approved', 'paid', 'void');
CREATE TYPE "PayRole" AS ENUM ('driver', 'helper');

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'draft',
    "total" DECIMAL(12,2) NOT NULL,
    "workerCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "role" "PayRole" NOT NULL,
    "date" DATE NOT NULL,
    "truckCode" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_number_key" ON "PayrollRun"("number");
CREATE INDEX "PayrollRun_status_idx" ON "PayrollRun"("status");
CREATE INDEX "PayrollLine_runId_idx" ON "PayrollLine"("runId");
CREATE INDEX "PayrollLine_tripId_idx" ON "PayrollLine"("tripId");
CREATE INDEX "PayrollLine_workerId_idx" ON "PayrollLine"("workerId");

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
