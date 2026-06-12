import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, RoleKey } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Exercises the full auth lifecycle against real Postgres + Redis.
// Sets up its own user so it doesn't depend on the seed having run.
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();

  const username = 'e2e_tester';
  const password = 'e2e-password-123';
  let userId: string;

  beforeAll(async () => {
    // Clean any leftover from a prior run, then create the user + ops_staff role.
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

  it('rejects malformed login body with 400', async () => {
    await request(server())
      .post('/auth/login')
      .send({ username, password, extra: 'nope' })
      .expect(400);
  });

  it('runs login → me → refresh (rotation) → logout', async () => {
    // login
    const login = await request(server())
      .post('/auth/login')
      .send({ username, password })
      .expect(200);
    const { accessToken, refreshToken } = login.body as {
      accessToken: string;
      refreshToken: string;
    };
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();

    // me — returns profile + roles, never a password hash
    const me = await request(server())
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

    // refresh → new pair
    const refreshed = await request(server())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    const newRefresh = (refreshed.body as { refreshToken: string })
      .refreshToken;
    expect(newRefresh).toBeTruthy();

    // old refresh token was rotated out → now invalid
    await request(server())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    // logout (needs access token) revokes the active refresh token
    await request(server())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // the rotated refresh token no longer works after logout
    await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: newRefresh })
      .expect(401);
  });
});
