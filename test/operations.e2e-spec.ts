import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, RoleKey } from '@prisma/client';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Operations (DailyTruckLog + Trip) over real Postgres/Redis. Verifies the
// universal-record flow: create a log → add trips with and without an explicit
// rateId (rate prepopulation + override) → derived totals → ops never sees money
// → confirm. Also covers the non-blocking warning behaviour. Self-seeds actors
// and master data so it does not depend on the seed script.
describe('Operations (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();

  const adminUsername = 'e2e_ops_admin';
  const opsUsername = 'e2e_ops_staff';
  const password = 'e2e-password-123';

  let adminToken: string;
  let opsToken: string;

  // Master data + created rows, for assertions and cleanup.
  let truckId: string;
  let clientId: string;
  let driverId: string;
  let helperId: string;
  let rateId: string;
  let logId: string;
  let emptyLogId: string;

  const logDate = '2026-06-15';

  async function ensureRole(key: RoleKey, name: string): Promise<string> {
    const role = await prisma.role.upsert({
      where: { key },
      update: {},
      create: { key, name },
    });
    return role.id;
  }

  async function makeUser(username: string, roleId: string): Promise<void> {
    await prisma.user.deleteMany({ where: { username } });
    await prisma.user.create({
      data: {
        username,
        passwordHash: await argon2.hash(password),
        roles: { create: { roleId } },
      },
    });
  }

  async function login(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    const adminRoleId = await ensureRole(RoleKey.admin, 'Administrator');
    const opsRoleId = await ensureRole(RoleKey.ops_staff, 'Operations Staff');
    await makeUser(adminUsername, adminRoleId);
    await makeUser(opsUsername, opsRoleId);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    adminToken = await login(adminUsername);
    opsToken = await login(opsUsername);

    // Master data via the admin API.
    const truck = await request(server())
      .post('/trucks')
      .set('Authorization', bearer(adminToken))
      .send({ code: 'E2E-OPS-TRUCK' })
      .expect(201);
    truckId = (truck.body as { id: string }).id;

    const client = await request(server())
      .post('/clients')
      .set('Authorization', bearer(adminToken))
      .send({ name: 'E2E Ops Co', code: 'E2EOPS' })
      .expect(201);
    clientId = (client.body as { id: string }).id;

    const driver = await request(server())
      .post('/workers')
      .set('Authorization', bearer(adminToken))
      .send({ fullName: 'E2E Driver', type: 'employee', canDrive: true })
      .expect(201);
    driverId = (driver.body as { id: string }).id;

    const helper = await request(server())
      .post('/workers')
      .set('Authorization', bearer(adminToken))
      .send({ fullName: 'E2E Helper', type: 'contractor', canHelp: true })
      .expect(201);
    helperId = (helper.body as { id: string }).id;

    const card = await request(server())
      .post(`/clients/${clientId}/rate-cards`)
      .set('Authorization', bearer(adminToken))
      .send({ name: 'E2E Ops Card' })
      .expect(201);
    const cardId = (card.body as { id: string }).id;

    const rate = await request(server())
      .post(`/rate-cards/${cardId}/rates`)
      .set('Authorization', bearer(adminToken))
      .send({
        label: 'E2E Route',
        clientPrice: 350,
        driverPay: 120,
        helperPay: 60,
        effectiveFrom: '2020-01-01T00:00:00.000Z',
      })
      .expect(201);
    rateId = (rate.body as { id: string }).id;
  });

  afterAll(async () => {
    await prisma.dailyTruckLog.deleteMany({ where: { truckId } });
    if (clientId) {
      await prisma.client.deleteMany({ where: { id: clientId } });
    }
    await prisma.worker.deleteMany({
      where: { id: { in: [driverId, helperId] } },
    });
    if (truckId) {
      await prisma.truck.deleteMany({ where: { id: truckId } });
    }
    await prisma.user.deleteMany({
      where: { username: { in: [adminUsername, opsUsername] } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  const server = (): App => app.getHttpServer();
  const bearer = (t: string): string => `Bearer ${t}`;

  it('ops creates a daily log (money stripped, draft, no warnings)', async () => {
    const res = await request(server())
      .post('/daily-logs')
      .set('Authorization', bearer(opsToken))
      .send({ date: logDate, truckId, fuelCost: 45, odometerStart: 120000 })
      .expect(201);
    const body = res.body as Record<string, unknown>;
    logId = body.id as string;
    expect(body.status).toBe('draft');
    expect(body.tripCount).toBe(0);
    expect(body.warnings).toEqual([]);
    // fuelCost is financial → stripped for ops.
    expect(body).not.toHaveProperty('fuelCost');
  });

  it('is idempotent: re-POST for the same (date, truck) returns the same log', async () => {
    const res = await request(server())
      .post('/daily-logs')
      .set('Authorization', bearer(opsToken))
      .send({ date: logDate, truckId })
      .expect(201);
    expect((res.body as { id: string }).id).toBe(logId);
  });

  it('ops adds a trip WITHOUT rateId → prepopulated from the effective rate', async () => {
    const res = await request(server())
      .post(`/daily-logs/${logId}/trips`)
      .set('Authorization', bearer(opsToken))
      .send({ clientId, routeLabel: 'E2E Route', driverWorkerId: driverId })
      .expect(201);
    const trip = res.body as Record<string, unknown>;
    expect(trip.seq).toBe(1);
    // Ops never receives money fields.
    expect(trip).not.toHaveProperty('billAmount');
    expect(trip).not.toHaveProperty('driverPay');
  });

  it('admin adds a trip WITH explicit billAmount override + rateId', async () => {
    const res = await request(server())
      .post(`/daily-logs/${logId}/trips`)
      .set('Authorization', bearer(adminToken))
      .send({
        clientId,
        routeLabel: 'E2E Route',
        driverWorkerId: driverId,
        helperWorkerId: helperId,
        billAmount: 500,
        rateId,
      })
      .expect(201);
    const trip = res.body as Record<string, unknown>;
    expect(trip.seq).toBe(2);
    // Override wins for billAmount; driver/helper pay prepopulate from the rate.
    expect(trip.billAmount).toBe('500.00');
    expect(trip.driverPay).toBe('120.00');
    expect(trip.helperPay).toBe('60.00');
    expect(trip.rateId).toBe(rateId);
  });

  it('admin GET log returns trips + summed totals (350 + 500)', async () => {
    const res = await request(server())
      .get(`/daily-logs/${logId}`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const body = res.body as {
      tripCount: number;
      totals: { billAmount: string; driverPay: string; helperPay: string };
      trips: { seq: number; billAmount: string }[];
    };
    expect(body.tripCount).toBe(2);
    expect(body.totals.billAmount).toBe('850.00');
    expect(body.totals.driverPay).toBe('240.00');
    expect(body.totals.helperPay).toBe('120.00');
    // Trip #1 was prepopulated from the rate (350).
    const trip1 = body.trips.find((t) => t.seq === 1);
    expect(trip1?.billAmount).toBe('350.00');
  });

  it('ops GET log sees tripCount but no money (totals + trip fields stripped)', async () => {
    const res = await request(server())
      .get(`/daily-logs/${logId}`)
      .set('Authorization', bearer(opsToken))
      .expect(200);
    const body = res.body as {
      tripCount: number;
      totals: Record<string, unknown>;
      trips: Record<string, unknown>[];
    };
    expect(body.tripCount).toBe(2);
    expect(body.totals).not.toHaveProperty('billAmount');
    expect(body.trips[0]).not.toHaveProperty('billAmount');
    expect(body.trips[0]).not.toHaveProperty('driverPay');
  });

  it('warns (but still saves) on an odometer regression', async () => {
    const res = await request(server())
      .patch(`/daily-logs/${logId}`)
      .set('Authorization', bearer(adminToken))
      .send({ odometerEnd: 119000 })
      .expect(200);
    const body = res.body as { odometerEnd: number; warnings: string[] };
    expect(body.odometerEnd).toBe(119000); // saved despite the warning
    expect(body.warnings.some((w) => w.includes('Odometer end'))).toBe(true);
  });

  it('confirms a log with trips (draft → confirmed, no empty warning)', async () => {
    const res = await request(server())
      .patch(`/daily-logs/${logId}/confirm`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const body = res.body as { status: string; warnings: string[] };
    expect(body.status).toBe('confirmed');
    expect(body.warnings.some((w) => w.includes('no trips'))).toBe(false);
  });

  it('warns (but still confirms) a log with zero trips', async () => {
    const created = await request(server())
      .post('/daily-logs')
      .set('Authorization', bearer(adminToken))
      .send({ date: '2026-06-16', truckId })
      .expect(201);
    emptyLogId = (created.body as { id: string }).id;

    const res = await request(server())
      .patch(`/daily-logs/${emptyLogId}/confirm`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const body = res.body as { status: string; warnings: string[] };
    expect(body.status).toBe('confirmed');
    expect(body.warnings.some((w) => w.includes('no trips'))).toBe(true);
  });

  it('rejects a trip with an unknown client (referential integrity)', async () => {
    await request(server())
      .post(`/daily-logs/${logId}/trips`)
      .set('Authorization', bearer(adminToken))
      .send({ clientId: 'does-not-exist', driverWorkerId: driverId })
      .expect(400);
  });

  it('forbids ops_staff from deleting a trip; admin can', async () => {
    const detail = await request(server())
      .get(`/daily-logs/${logId}`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const tripId = (detail.body as { trips: { id: string }[] }).trips[0].id;

    await request(server())
      .delete(`/trips/${tripId}`)
      .set('Authorization', bearer(opsToken))
      .expect(403);

    await request(server())
      .delete(`/trips/${tripId}`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
  });

  it('returns the dashboard summary with per-truck status + counts', async () => {
    const res = await request(server())
      .get('/operations/summary')
      .query({ date: logDate })
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const body = res.body as {
      trucks: { truckId: string; status: string }[];
      counts: { trucks: number; confirmed: number };
    };
    const row = body.trucks.find((t) => t.truckId === truckId);
    expect(row?.status).toBe('confirmed');
    expect(body.counts.confirmed).toBeGreaterThanOrEqual(1);
  });
});
