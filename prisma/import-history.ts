// One-off historical import: loads the JSON produced by tools/parse-history-xlsx.py
// (from the legacy Camion_con_Jorge.xlsx) into the database.
//
// Idempotent: masters upsert on their natural key (truck.code, client.code) or
// find-or-create by name (workers); operational data is wiped within the
// imported date range and reinserted, so re-running yields the same result.
//
// The JSON holds real client financial data and is gitignored — pass its path:
//   npx ts-node prisma/import-history.ts prisma/.history-import.json
import {
  LogStatus,
  OperStatus,
  Prisma,
  PrismaClient,
  TruckStatus,
  UserStatus,
  WorkerType,
} from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface TruckIn {
  code: string;
  plate: string | null;
  year: number | null;
  sizeFt: number | null;
  purchaseDate: string | null;
  purchasePrice: string | null;
  odometerStart: number | null;
}
interface TripIn {
  seq: number;
  clientName: string;
  charge: string;
  driverKey: string;
  driverPay: string;
  helperKey: string | null;
  helperPay: string;
}
interface LogIn {
  truckCode: string;
  date: string;
  fuelCost: string | null;
  trips: TripIn[];
}
interface Payload {
  meta: Record<string, unknown>;
  trucks: TruckIn[];
  clients: { name: string; code: string }[];
  workers: { key: string; fullName: string }[];
  logs: LogIn[];
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('usage: ts-node prisma/import-history.ts <json>');
  const data: Payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('source meta:', data.meta);

  // 1) Trucks — upsert by unique code.
  for (const t of data.trucks) {
    const fields = {
      plate: t.plate ?? undefined,
      year: t.year ?? undefined,
      sizeFt: t.sizeFt ?? undefined,
      purchaseDate: t.purchaseDate ? new Date(t.purchaseDate) : undefined,
      purchasePrice: t.purchasePrice ?? undefined,
      odometerStart: t.odometerStart ?? undefined,
    };
    await prisma.truck.upsert({
      where: { code: t.code },
      update: fields,
      create: { code: t.code, status: TruckStatus.active, ...fields },
    });
  }
  const truckIdByCode = new Map(
    (await prisma.truck.findMany()).map((t) => [t.code, t.id]),
  );

  // 2) Clients — upsert by unique code. Periods are irregular/client-driven.
  for (const c of data.clients) {
    await prisma.client.upsert({
      where: { code: c.code },
      update: { name: c.name },
      create: {
        code: c.code,
        name: c.name,
        billingFrequency: 'irregular',
        status: UserStatus.active,
      },
    });
  }
  const clientIdByName = new Map(
    (await prisma.client.findMany()).map((c) => [c.name, c.id]),
  );

  // 3) Workers — no natural key; find-or-create by fullName. Single
  // interchangeable pool (canDrive + canHelp). Map legacy "num. name" key -> id.
  const nameToId = new Map<string, string>();
  for (const w of await prisma.worker.findMany()) {
    if (!nameToId.has(w.fullName)) nameToId.set(w.fullName, w.id);
  }
  const keyToWorkerId = new Map<string, string>();
  for (const w of data.workers) {
    let id = nameToId.get(w.fullName);
    if (!id) {
      const created = await prisma.worker.create({
        data: {
          fullName: w.fullName,
          type: WorkerType.contractor,
          canDrive: true,
          canHelp: true,
          status: UserStatus.active,
        },
      });
      id = created.id;
      nameToId.set(w.fullName, id);
    }
    keyToWorkerId.set(w.key, id);
  }

  // 4) Wipe existing operational data in the imported range so re-runs are clean
  // (cascade deletes trips). The seed's sample "today" log sits outside this range.
  const dates = data.logs.map((l) => l.date).sort();
  const min = new Date(dates[0]);
  const max = new Date(dates[dates.length - 1]);
  const del = await prisma.dailyTruckLog.deleteMany({
    where: { date: { gte: min, lte: max } },
  });
  console.log(`cleared ${del.count} logs in [${dates[0]} .. ${dates[dates.length - 1]}]`);

  // 5) Insert logs + their trips. All historical logs are final -> confirmed.
  let logN = 0;
  let tripN = 0;
  let skippedTrips = 0;
  let skippedLogs = 0;
  for (const l of data.logs) {
    const truckId = truckIdByCode.get(l.truckCode);
    if (!truckId) {
      skippedLogs++;
      continue;
    }
    const log = await prisma.dailyTruckLog.create({
      data: {
        date: new Date(l.date),
        truckId,
        fuelCost: l.fuelCost ?? null,
        status: LogStatus.confirmed,
        // Historical logs all have trips → they were operating days.
        operStatus: OperStatus.operating,
      },
    });
    logN++;
    const trips: Prisma.TripCreateManyInput[] = [];
    for (const tp of l.trips) {
      const clientId = clientIdByName.get(tp.clientName);
      const driverWorkerId = keyToWorkerId.get(tp.driverKey);
      if (!clientId || !driverWorkerId) {
        skippedTrips++;
        continue;
      }
      trips.push({
        dailyLogId: log.id,
        seq: tp.seq,
        clientId,
        billAmount: tp.charge,
        driverWorkerId,
        driverPay: tp.driverPay,
        helperWorkerId: tp.helperKey ? (keyToWorkerId.get(tp.helperKey) ?? null) : null,
        helperPay: tp.helperPay,
      });
    }
    if (trips.length) {
      await prisma.trip.createMany({ data: trips });
      tripN += trips.length;
    }
  }

  console.log(
    `imported: ${truckIdByCode.size} trucks, ${clientIdByName.size} clients, ` +
      `${keyToWorkerId.size} worker-keys, ${logN} logs, ${tripN} trips ` +
      `(skipped ${skippedLogs} logs, ${skippedTrips} trips)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
