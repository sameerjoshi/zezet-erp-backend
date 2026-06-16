-- Per-truck cost tracking + P&L (ADR 0006).

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('maintenance', 'toll', 'insurance', 'tax', 'repair', 'other');

-- CreateTable
CREATE TABLE "TruckCost" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" "CostCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TruckCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TruckCost_truckId_date_idx" ON "TruckCost"("truckId", "date");
CREATE INDEX "TruckCost_date_idx" ON "TruckCost"("date");

-- AddForeignKey
ALTER TABLE "TruckCost" ADD CONSTRAINT "TruckCost_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
