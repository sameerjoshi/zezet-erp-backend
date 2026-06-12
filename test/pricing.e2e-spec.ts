import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, RoleKey } from '@prisma/client';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Master-data + Pricing over real Postgres/Redis. Verifies the end-to-end
// pricing flow (client → rate card → rate → effective-rate lookup) and the
// HARD financial-gate requirement: ops roles never receive money fields, while
// admin/finance do. Self-seeds its actors so it doesn't depend on the seed.
describe('Pricing / master data (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();

  const adminUsername = 'e2e_pricing_admin';
  const financeUsername = 'e2e_pricing_finance';
  const opsUsername = 'e2e_pricing_ops';
  const password = 'e2e-password-123';

  let adminToken: string;
  let financeToken: string;
  let opsToken: string;

  // Track created rows for cleanup.
  let clientId: string;
  let truckId: string;

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
    const financeRoleId = await ensureRole(RoleKey.finance, 'Finance');
    const opsRoleId = await ensureRole(RoleKey.ops_staff, 'Operations Staff');

    await makeUser(adminUsername, adminRoleId);
    await makeUser(financeUsername, financeRoleId);
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
    financeToken = await login(financeUsername);
    opsToken = await login(opsUsername);
  });

  afterAll(async () => {
    if (clientId) {
      // Cascade removes rate cards + rates.
      await prisma.client.deleteMany({ where: { id: clientId } });
    }
    if (truckId) {
      await prisma.truck.deleteMany({ where: { id: truckId } });
    }
    await prisma.user.deleteMany({
      where: {
        username: { in: [adminUsername, financeUsername, opsUsername] },
      },
    });
    await prisma.$disconnect();
    await app.close();
  });

  const server = (): App => app.getHttpServer();
  const bearer = (t: string): string => `Bearer ${t}`;

  it('admin creates client → rate card → rate, and lookup returns it with money', async () => {
    const client = await request(server())
      .post('/clients')
      .set('Authorization', bearer(adminToken))
      .send({ name: 'E2E Pricing Co', code: 'E2EPRICE' })
      .expect(201);
    clientId = (client.body as { id: string }).id;

    const card = await request(server())
      .post(`/clients/${clientId}/rate-cards`)
      .set('Authorization', bearer(adminToken))
      .send({ name: 'E2E Card' })
      .expect(201);
    const cardId = (card.body as { id: string }).id;

    await request(server())
      .post(`/rate-cards/${cardId}/rates`)
      .set('Authorization', bearer(adminToken))
      .send({
        label: 'E2E Route',
        clientPrice: 100,
        driverPay: 40,
        helperPay: 20,
        effectiveFrom: '2020-01-01T00:00:00.000Z',
      })
      .expect(201);

    const lookup = await request(server())
      .get('/rates/lookup')
      .query({ clientId, label: 'E2E Route' })
      .set('Authorization', bearer(adminToken))
      .expect(200);

    const body = lookup.body as {
      found: boolean;
      rate: { label: string; clientPrice?: string } | null;
    };
    expect(body.found).toBe(true);
    expect(body.rate?.label).toBe('E2E Route');
    expect(body.rate?.clientPrice).toBe('100.00');
  });

  it('lookup returns found=false when no rate matches the label', async () => {
    const res = await request(server())
      .get('/rates/lookup')
      .query({ clientId, label: 'No Such Route' })
      .set('Authorization', bearer(adminToken))
      .expect(200);
    const body = res.body as { found: boolean; rate: unknown };
    expect(body.found).toBe(false);
    expect(body.rate).toBeNull();
  });

  it('strips money fields from the lookup for an ops user', async () => {
    const res = await request(server())
      .get('/rates/lookup')
      .query({ clientId, label: 'E2E Route' })
      .set('Authorization', bearer(opsToken))
      .expect(200);
    const rate = (res.body as { rate: Record<string, unknown> }).rate;
    expect(rate).toBeTruthy();
    expect(rate.label).toBe('E2E Route');
    expect(rate).not.toHaveProperty('clientPrice');
    expect(rate).not.toHaveProperty('driverPay');
    expect(rate).not.toHaveProperty('helperPay');
  });

  it('keeps money fields in the lookup for a finance user', async () => {
    const res = await request(server())
      .get('/rates/lookup')
      .query({ clientId, label: 'E2E Route' })
      .set('Authorization', bearer(financeToken))
      .expect(200);
    const rate = (res.body as { rate: Record<string, unknown> }).rate;
    expect(rate.clientPrice).toBe('100.00');
    expect(rate.driverPay).toBe('40.00');
    expect(rate.helperPay).toBe('20.00');
  });

  it('forbids an ops user from managing pricing (manage Rate)', async () => {
    await request(server())
      .post(`/clients/${clientId}/rate-cards`)
      .set('Authorization', bearer(opsToken))
      .send({ name: 'Ops Should Not Create' })
      .expect(403);
  });

  it('admin sees a truck purchasePrice; ops does not', async () => {
    const created = await request(server())
      .post('/trucks')
      .set('Authorization', bearer(adminToken))
      .send({ code: 'E2E-TRUCK-1', purchasePrice: 50000 })
      .expect(201);
    const truck = created.body as { id: string; purchasePrice?: string };
    truckId = truck.id;
    expect(truck.purchasePrice).toBe('50000.00');

    const opsView = await request(server())
      .get(`/trucks/${truckId}`)
      .set('Authorization', bearer(opsToken))
      .expect(200);
    expect(opsView.body).not.toHaveProperty('purchasePrice');
    // Non-financial fields still come through.
    expect((opsView.body as { code: string }).code).toBe('E2E-TRUCK-1');
  });
});
