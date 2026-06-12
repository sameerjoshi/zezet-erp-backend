import { Prisma } from '@prisma/client';
import {
  aggregateClientBillables,
  aggregateTrips,
  aggregateUtilization,
  aggregateWorkerPay,
  ReportTripRow,
} from './reporting.aggregate';

const D = (n: number): Prisma.Decimal => new Prisma.Decimal(n);

// Three trips across two days / two trucks / two clients / two workers.
//  - day 1, truck A, client X, driver d1, helper d2: bill 100, drv 30, hlp 10
//  - day 1, truck B, client X, driver d2 (no helper):  bill 200, drv 40, hlp 0
//  - day 2, truck A, client Y, driver d1, helper d2:   bill 300, drv 50, hlp 20
function fixture(): ReportTripRow[] {
  return [
    {
      date: '2026-06-01',
      truckId: 'A',
      truckCode: 'Camión A',
      clientId: 'X',
      clientName: 'Client X',
      driverWorkerId: 'd1',
      driverWorkerName: 'Driver One',
      helperWorkerId: 'd2',
      helperWorkerName: 'Driver Two',
      billAmount: D(100),
      driverPay: D(30),
      helperPay: D(10),
    },
    {
      date: '2026-06-01',
      truckId: 'B',
      truckCode: 'Camión B',
      clientId: 'X',
      clientName: 'Client X',
      driverWorkerId: 'd2',
      driverWorkerName: 'Driver Two',
      helperWorkerId: null,
      helperWorkerName: null,
      billAmount: D(200),
      driverPay: D(40),
      helperPay: D(0),
    },
    {
      date: '2026-06-02',
      truckId: 'A',
      truckCode: 'Camión A',
      clientId: 'Y',
      clientName: 'Client Y',
      driverWorkerId: 'd1',
      driverWorkerName: 'Driver One',
      helperWorkerId: 'd2',
      helperWorkerName: 'Driver Two',
      billAmount: D(300),
      driverPay: D(50),
      helperPay: D(20),
    },
  ];
}

describe('aggregateTrips', () => {
  it('counts per day and per truck', () => {
    const { perDay, perTruck } = aggregateTrips(fixture());
    expect(perDay).toEqual([
      { date: '2026-06-01', tripCount: 2 },
      { date: '2026-06-02', tripCount: 1 },
    ]);
    expect(perTruck).toEqual([
      { truckId: 'A', truckCode: 'Camión A', tripCount: 2 },
      { truckId: 'B', truckCode: 'Camión B', tripCount: 1 },
    ]);
  });

  it('returns empty lists for no trips', () => {
    expect(aggregateTrips([])).toEqual({ perDay: [], perTruck: [] });
  });
});

describe('aggregateUtilization', () => {
  it('reports distinct trucks-with-trips ÷ active trucks per day, incl. empty days', () => {
    const days = ['2026-06-01', '2026-06-02', '2026-06-03'];
    const result = aggregateUtilization(fixture(), days, 4);
    expect(result).toEqual([
      {
        date: '2026-06-01',
        activeTrucks: 4,
        trucksWithTrips: 2,
        utilization: 0.5,
      },
      {
        date: '2026-06-02',
        activeTrucks: 4,
        trucksWithTrips: 1,
        utilization: 0.25,
      },
      {
        date: '2026-06-03',
        activeTrucks: 4,
        trucksWithTrips: 0,
        utilization: 0,
      },
    ]);
  });

  it('does not double-count a truck that runs multiple trips in a day', () => {
    const rows = fixture().filter((r) => r.date === '2026-06-01');
    // Truck A runs twice on the same day -> still counts as one utilized truck.
    rows.push({ ...rows[0] });
    const [day] = aggregateUtilization(rows, ['2026-06-01'], 2);
    expect(day.trucksWithTrips).toBe(2);
    expect(day.utilization).toBe(1);
  });

  it('yields 0 utilization when there are no active trucks (no divide-by-zero)', () => {
    const [day] = aggregateUtilization(fixture(), ['2026-06-01'], 0);
    expect(day.utilization).toBe(0);
  });
});

describe('aggregateWorkerPay', () => {
  it('sums driver pay and helper pay per worker', () => {
    const workers = aggregateWorkerPay(fixture());
    // d1: drove trip1 (30) + trip3 (50) = 80 driver, 0 helper -> 80
    // d2: drove trip2 (40) = 40 driver; helped trip1 (10) + trip3 (20) = 30 -> 70
    expect(workers).toEqual([
      {
        workerId: 'd1',
        workerName: 'Driver One',
        driverPay: '80.00',
        helperPay: '0.00',
        totalPay: '80.00',
      },
      {
        workerId: 'd2',
        workerName: 'Driver Two',
        driverPay: '40.00',
        helperPay: '30.00',
        totalPay: '70.00',
      },
    ]);
  });
});

describe('aggregateClientBillables', () => {
  it('sums billAmount and trip count per client, sorted by billAmount desc', () => {
    const clients = aggregateClientBillables(fixture());
    expect(clients).toEqual([
      {
        clientId: 'X',
        clientName: 'Client X',
        tripCount: 2,
        billAmount: '300.00',
      },
      {
        clientId: 'Y',
        clientName: 'Client Y',
        tripCount: 1,
        billAmount: '300.00',
      },
    ]);
  });
});
