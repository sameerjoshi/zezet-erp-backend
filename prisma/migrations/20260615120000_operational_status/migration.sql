-- Operational tracking: per-truck-per-day status (operating / no_clients / broken)
-- and a truck "in service" date so not-yet-drivable trucks don't deflate the %.

-- CreateEnum
CREATE TYPE "OperStatus" AS ENUM ('operating', 'no_clients', 'broken');

-- AlterTable: Truck gets an in-service (ready-to-drive) date
ALTER TABLE "Truck" ADD COLUMN "inServiceDate" DATE;

-- AlterTable: daily log gets the operational status
ALTER TABLE "DailyTruckLog" ADD COLUMN "operStatus" "OperStatus";

-- Backfill: every historical log that has at least one trip was an operating day.
UPDATE "DailyTruckLog"
  SET "operStatus" = 'operating'
  WHERE "id" IN (SELECT DISTINCT "dailyLogId" FROM "Trip");

-- Backfill: existing trucks become countable from their purchase date (best
-- available proxy for "in service"); editable afterwards.
UPDATE "Truck"
  SET "inServiceDate" = "purchaseDate"
  WHERE "inServiceDate" IS NULL AND "purchaseDate" IS NOT NULL;
