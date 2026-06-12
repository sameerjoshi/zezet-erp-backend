import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, RoleKey } from '@prisma/client';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const REFRESH_COOKIE = 'refresh_token';

// Pull the `refresh_token=...` pair (sans attributes) out of a Set-Cookie header.
function refreshCookieFrom(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = (header ?? []).find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!cookie) {
    throw new Error('no refresh_token cookie on response');
  }
  return cookie.split(';')[0];
}

// Exercises the full cookie-based auth lifecycle (ADR 0001) against real
// Postgres + Redis. Self-seeds its user so it doesn't depend on the seed.
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();

  const username = 'e2e_tester';
  const password = 'e2e-password-123';
  let userId: string;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { username } });
    const role = await prisma.role.upsert({
      where: { key: RoleKey.ops_staff },
      update: {},
      create: { key: RoleKey.ops_staff, name: 'Operations Staff' },
    });
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await argon2.hash(password),
        roles: { create: { roleId: role.id } },
      },
    });
    userId = user.id;

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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username } });
    await prisma.$disconnect();
    await app.close();
  });

  const server = (): App => app.getHttpServer();

  it('rejects bad credentials with 401', async () => {
    await request(server())
      .post('/auth/login')
      .send({ username, password: 'wrong' })
      .expect(401);
  });

  it('refresh without a cookie → 401', async () => {
    await request(server()).post('/auth/refresh').expect(401);
  });

  it('login sets an httpOnly refresh cookie and omits the refresh token from the body', async () => {
    const res = await request(server())
      .post('/auth/login')
      .send({ username, password })
      .expect(200);

    const body = res.body as { accessToken: string };
    expect(res.body).toMatchObject({ tokenType: 'Bearer' });
    expect(body.accessToken).toBeTruthy();
    expect(res.body).not.toHaveProperty('refreshToken');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith(`${REFRESH_COOKIE}=`))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/auth/i);
  });

  it('runs me → refresh (rotation) → logout via the cookie jar', async () => {
    const agent = request.agent(server());

    const login = await agent
      .post('/auth/login')
      .send({ username, password })
      .expect(200);
    const accessToken = (login.body as { accessToken: string }).accessToken;
    const oldCookie = refreshCookieFrom(login);

    // me — profile + roles, never the password hash
    const me = await agent
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      id: userId,
      username,
      roles: [RoleKey.ops_staff],
    });
    expect(me.body).not.toHaveProperty('passwordHash');

    // me without a token → 401
    await request(server()).get('/auth/me').expect(401);

    // refresh — cookie sent automatically by the agent; rotates the cookie
    const refreshed = await agent.post('/auth/refresh').expect(200);
    const newCookie = refreshCookieFrom(refreshed);
    expect(newCookie).not.toEqual(oldCookie);

    // the rotated-out cookie is now rejected
    await request(server())
      .post('/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(401);

    // logout (needs access token) revokes the refresh token + clears the cookie
    await agent
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // the current cookie no longer works after logout (Redis key gone)
    await request(server())
      .post('/auth/refresh')
      .set('Cookie', newCookie)
      .expect(401);
  });
});
