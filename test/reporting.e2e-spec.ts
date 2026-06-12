import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, RoleKey } from '@prisma/client';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Reporting (role-gated date-range aggregates) over real Postgres/Redis. Seeds a
// truck + client + two workers + a rate, then a log with two trips across two
// days, and verifies: admin gets the expected report shapes WITH money; an ops
// role is 403'd on the `Report` subject (and so never sees the figures at all).
// Self-seeds + cleans its own rows (E2E-REP-*, users e2e_rep_*).
describe('Reporting (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();

  const adminUsername = 'e2e_rep_admin';
  const opsUsername = 'e2e_rep_ops';
  const password = 'e2e-password-123';

  let adminToken: string;
  let opsToken: string;

  let truckId: string;
  let clientId: string;
  let driverId: string;
  let helperId: string;

  const dayOne = '2026-07-20';
  const dayTwo = '2026-07-21';
  const from = '2026-07-01';
  const to = '2026-07-31';

  const server = (): App => app.getHttpServer();
  const bearer = (t: string): string => `Bearer ${t}`;

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
    const res = await request(server())
      .post('/auth/login')
      .send({ username, password })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function makeLogWithTrip(date: string): Promise<void> {
    const log = await request(server())
      .post('/daily-logs')
      .set('Authorization', bearer(adminToken))
      .send({ date, truckId })
      .expect(201);
    const logId = (log.body as { id: string }).id;
    await request(server())
      .post(`/daily-logs/${logId}/trips`)
      .set('Authorization', bearer(adminToken))
      .send({
        clientId,
        routeLabel: 'E2E Rep Route',
        driverWorkerId: driverId,
        helperWorkerId: helperId,
        billAmount: 400,
        driverPay: 120,
        helperPay: 60,
      })
      .expect(201);
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

    const truck = await request(server())
      .post('/trucks')
      .set('Authorization', bearer(adminToken))
      .send({ code: 'E2E-REP-TRUCK' })
      .expect(201);
    truckId = (truck.body as { id: string }).id;

    const client = await request(server())
      .post('/clients')
      .set('Authorization', bearer(adminToken))
      .send({ name: 'E2E Rep Co', code: 'E2EREP' })
      .expect(201);
    clientId = (client.body as { id: string }).id;

    const driver = await request(server())
      .post('/workers')
      .set('Authorization', bearer(adminToken))
      .send({ fullName: 'E2E Rep Driver', type: 'employee', canDrive: true })
      .expect(201);
    driverId = (driver.body as { id: string }).id;

    const helper = await request(server())
      .post('/workers')
      .set('Authorization', bearer(adminToken))
      .send({ fullName: 'E2E Rep Helper', type: 'contractor', canHelp: true })
      .expect(201);
    helperId = (helper.body as { id: string }).id;

    await makeLogWithTrip(dayOne);
    await makeLogWithTrip(dayTwo);
    // Heavy setup (argon2 hashing + ~10 sequential HTTP calls). Under the
    // parallel e2e run this can exceed jest's default 5s hook budget, so give
    // it generous headroom.
  }, 30000);

  afterAll(async () => {
    await prisma.dailyTruckLog.deleteMany({ where: { truckId } });
    if (clientId) {
      await prisma.client.deleteMany({ where: { id: clientId } });
    }
    const workerIds = [driverId, helperId].filter(Boolean);
    if (workerIds.length) {
      await prisma.worker.deleteMany({ where: { id: { in: workerIds } } });
    }
    if (truckId) {
      await prisma.truck.deleteMany({ where: { id: truckId } });
    }
    await prisma.user.deleteMany({
      where: { username: { in: [adminUsername, opsUsername] } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('GET /reports/trips → per-day + per-truck counts (admin)', async () => {
    const res = await request(server())
      .get('/reports/trips')
      .query({ from, to })
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const body = res.body as {
      from: string;
      to: string;
      totalTrips: number;
      perDay: { date: string; tripCount: number }[];
      perTruck: { truckId: string; tripCount: number }[];
    };
    expect(body.from).toBe(from);
    expect(body.to).toBe(to);
    expect(body.totalTrips).toBeGreaterThanOrEqual(2);
    // Our truck ran exactly one trip on each of the two days.
    const truckRow = body.perTruck.find((t) => t.truckId === truckId);
    expect(truckRow?.tripCount).toBe(2);
    expect(
      body.perDay.find((d) => d.date === dayOne)?.tripCount,
    ).toBeGreaterThanOrEqual(1);
  });

  it('GET /reports/utilization → per-day ratio incl. our truck (admin)', async () => {
    const res = await request(server())
      .get('/reports/utilization')
      .query({ from, to })
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const body = res.body as {
      perDay: {
        date: string;
        activeTrucks: number;
        trucksWithTrips: number;
        utilization: number;
      }[];
    };
    // Inclusive 31-day July window.
    expect(body.perDay).toHaveLength(31);
    const day = body.perDay.find((d) => d.date === dayOne)!;
    expect(day.trucksWithTrips).toBeGreaterThanOrEqual(1);
    expect(typeof day.utilization).toBe('number');
  });

  it('GET /reports/worker-pay → driver/helper/total money present for admin', async () => {
    const res = await request(server())
      .get('/reports/worker-pay')
      .query({ from, to })
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const body = res.body as {
      workers: {
        workerId: string;
        driverPay: string;
        helperPay: string;
        totalPay: string;
      }[];
    };
    const driver = body.workers.find((w) => w.workerId === driverId);
    expect(driver?.driverPay).toBe('240.00'); // 120 × 2 days
    const helper = body.workers.find((w) => w.workerId === helperId);
    expect(helper?.helperPay).toBe('120.00'); // 60 × 2 days
    expect(helper?.totalPay).toBe('120.00');
  });

  it('GET /reports/client-billables → billAmount present for admin', async () => {
    const res = await request(server())
      .get('/reports/client-billables')
      .query({ from, to })
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const body = res.body as {
      clients: { clientId: string; tripCount: number; billAmount: string }[];
    };
    const client = body.clients.find((c) => c.clientId === clientId);
    expect(client?.tripCount).toBe(2);
    expect(client?.billAmount).toBe('800.00'); // 400 × 2 days
  });

  it('forbids an operations role from every report (403 on the Report subject)', async () => {
    for (const path of [
      '/reports/trips',
      '/reports/utilization',
      '/reports/worker-pay',
      '/reports/client-billables',
    ]) {
      await request(server())
        .get(path)
        .query({ from, to })
        .set('Authorization', bearer(opsToken))
        .expect(403);
    }
  });

  it('rejects an inverted range with 400', async () => {
    await request(server())
      .get('/reports/trips')
      .query({ from: to, to: from })
      .set('Authorization', bearer(adminToken))
      .expect(400);
  });
});
