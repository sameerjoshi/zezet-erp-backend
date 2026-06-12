import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Verifies the login rate limit (10 / minute / IP). Isolated in its own spec so
// no other login traffic eats into the budget: the ThrottlerGuard storage is
// in-memory and per-app-instance, so a fresh app starts the counter at zero.
// Credentials are intentionally bad — the throttler runs BEFORE the handler, so
// the first 10 attempts get 401 and the 11th is rejected with 429.
describe('Auth throttling (e2e)', () => {
  let app: INestApplication<App>;
  const LIMIT = 10;

  beforeAll(async () => {
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
    await app.close();
  });

  it('returns 429 once the per-minute login limit is exceeded', async () => {
    const server = app.getHttpServer();
    const creds = { username: 'no_such_user', password: 'definitely-wrong' };

    // First LIMIT attempts pass the throttler and fail auth (401).
    for (let i = 0; i < LIMIT; i += 1) {
      await request(server).post('/auth/login').send(creds).expect(401);
    }

    // The next one is blocked by the throttler.
    await request(server).post('/auth/login').send(creds).expect(429);
  });
});
