import { Prisma } from '@prisma/client';

// Pure aggregation core for the reporting module. All math lives here (no I/O)
// so it is unit-testable in isolation: the service fetches rows, these functions
// fold them into the report shapes. Money is summed with Prisma.Decimal (no
// float drift) and serialized as 2-dp strings — the project wire format.

// One trip flattened with the reference data the reports need. `date` is the
// parent DailyTruckLog date as YYYY-MM-DD (the Trip itself is not dated).
export interface ReportTripRow {
  date: string;
  truckId: string;
  truckCode: string;
  clientId: string;
  clientName: string;
  driverWorkerId: string;
  driverWorkerName: string;
  helperWorkerId: string | null;
  helperWorkerName: string | null;
  billAmount: Prisma.Decimal;
  driverPay: Prisma.Decimal;
  helperPay: Prisma.Decimal;
}

export interface DayTripCount {
  date: string;
  tripCount: number;
}

export interface TruckTripCount {
  truckId: string;
  truckCode: string;
  tripCount: number;
}

export interface TripsAggregate {
  perDay: DayTripCount[];
  perTruck: TruckTripCount[];
}

// Trip counts grouped by day and by truck. Only days/trucks that actually have
// trips appear; both lists are sorted deterministically (date asc, truck code).
export function aggregateTrips(rows: ReportTripRow[]): TripsAggregate {
  const byDay = new Map<string, number>();
  const byTruck = new Map<string, TruckTripCount>();

  for (const row of rows) {
    byDay.set(row.date, (byDay.get(row.date) ?? 0) + 1);
    const truck = byTruck.get(row.truckId) ?? {
      truckId: row.truckId,
      truckCode: row.truckCode,
      tripCount: 0,
    };
    truck.tripCount += 1;
    byTruck.set(row.truckId, truck);
  }

  const perDay = [...byDay.entries()]
    .map(([date, tripCount]) => ({ date, tripCount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const perTruck = [...byTruck.values()].sort((a, b) =>
    a.truckCode.localeCompare(b.truckCode),
  );

  return { perDay, perTruck };
}

export interface DayUtilization {
  date: string;
  activeTrucks: number;
  trucksWithTrips: number;
  // trucksWithTrips / activeTrucks, a 0..1 ratio rounded to 4 decimals (0 when
  // there are no active trucks). Multiply by 100 for a percentage on the client.
  utilization: number;
}

// Active-truck utilization per day across the full requested range. `days` is
// the inclusive list of YYYY-MM-DD strings so zero-trip days are still reported.
export function aggregateUtilization(
  rows: ReportTripRow[],
  days: string[],
  activeTrucks: number,
): DayUtilization[] {
  const trucksPerDay = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = trucksPerDay.get(row.date) ?? new Set<string>();
    set.add(row.truckId);
    trucksPerDay.set(row.date, set);
  }

  return days.map((date) => {
    const trucksWithTrips = trucksPerDay.get(date)?.size ?? 0;
    const utilization =
      activeTrucks > 0
        ? Number((trucksWithTrips / activeTrucks).toFixed(4))
        : 0;
    return { date, activeTrucks, trucksWithTrips, utilization };
  });
}

export interface WorkerPay {
  workerId: string;
  workerName: string;
  driverPay: string;
  helperPay: string;
  totalPay: string;
}

// Total pay per worker over the range: a worker accrues driverPay on trips they
// drove and helperPay on trips they helped. Both are summed; totalPay is the
// sum the brief asks for. Sorted by totalPay desc (highest earners first).
export function aggregateWorkerPay(rows: ReportTripRow[]): WorkerPay[] {
  const zero = new Prisma.Decimal(0);
  const byWorker = new Map<
    string,
    { name: string; driver: Prisma.Decimal; helper: Prisma.Decimal }
  >();

  const ensure = (id: string, name: string) => {
    const existing = byWorker.get(id);
    if (existing) {
      return existing;
    }
    const created = { name, driver: zero, helper: zero };
    byWorker.set(id, created);
    return created;
  };

  for (const row of rows) {
    const driver = ensure(row.driverWorkerId, row.driverWorkerName);
    driver.driver = driver.driver.add(row.driverPay);
    if (row.helperWorkerId) {
      const helper = ensure(row.helperWorkerId, row.helperWorkerName ?? '');
      helper.helper = helper.helper.add(row.helperPay);
    }
  }

  return [...byWorker.entries()]
    .map(([workerId, v]) => ({
      workerId,
      workerName: v.name,
      driverPay: v.driver.toFixed(2),
      helperPay: v.helper.toFixed(2),
      totalPay: v.driver.add(v.helper).toFixed(2),
    }))
    .sort(
      (a, b) =>
        Number(b.totalPay) - Number(a.totalPay) ||
        a.workerName.localeCompare(b.workerName),
    );
}

export interface ClientBillable {
  clientId: string;
  clientName: string;
  tripCount: number;
  billAmount: string;
}

// Total billable per client over the range. Sorted by billAmount desc.
export function aggregateClientBillables(
  rows: ReportTripRow[],
): ClientBillable[] {
  const zero = new Prisma.Decimal(0);
  const byClient = new Map<
    string,
    { name: string; trips: number; bill: Prisma.Decimal }
  >();

  for (const row of rows) {
    const entry = byClient.get(row.clientId) ?? {
      name: row.clientName,
      trips: 0,
      bill: zero,
    };
    entry.trips += 1;
    entry.bill = entry.bill.add(row.billAmount);
    byClient.set(row.clientId, entry);
  }

  return [...byClient.entries()]
    .map(([clientId, v]) => ({
      clientId,
      clientName: v.name,
      tripCount: v.trips,
      billAmount: v.bill.toFixed(2),
    }))
    .sort(
      (a, b) =>
        Number(b.billAmount) - Number(a.billAmount) ||
        a.clientName.localeCompare(b.clientName),
    );
}
