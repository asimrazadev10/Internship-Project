import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * Exercises the full local-auth flow against the real database: registration, login, the
 * access-token guard, refresh-token rotation, reuse detection, and logout.
 *
 * These assertions are the behaviour the whole auth design exists to produce — the security
 * properties (no password on the wire, generic login failure, one-time refresh tokens, family
 * revocation on reuse) are only real if observed end to end, not inferred from the code.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const user = {
    email: `auth-e2e-${Date.now()}@example.com`,
    password: 'correct-horse-battery',
    name: 'E2E User',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror the production pipe so validation behaves identically under test.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    // Clean up only this test's user; cascade removes its refresh tokens.
    await prisma.user.deleteMany({ where: { email: user.email } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('registers a user and returns tokens without leaking the password', async () => {
    const res = await request(server())
      .post('/auth/register')
      .send(user)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    // The hash must never appear anywhere in the response.
    expect(res.body.data.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('$argon2');
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await request(server())
      .post('/auth/register')
      .send(user)
      .expect(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects an unknown field (forbidNonWhitelisted)', async () => {
    const res = await request(server())
      .post('/auth/register')
      .send({ ...user, isAdmin: true })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in with correct credentials', async () => {
    const res = await request(server())
      .post('/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('rejects a wrong password with a generic 401', async () => {
    const res = await request(server())
      .post('/auth/login')
      .send({ email: user.email, password: 'wrong' })
      .expect(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('gives the same generic 401 for an unknown email (no enumeration)', async () => {
    const res = await request(server())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' })
      .expect(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('protects a guarded route: logout without a token is 401', async () => {
    await request(server())
      .post('/auth/logout')
      .send({ refreshToken: 'x' })
      .expect(401);
  });

  it('rotates refresh tokens and detects reuse of a consumed token', async () => {
    // Fresh session.
    const login = await request(server())
      .post('/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    const firstRefresh = login.body.data.refreshToken;

    // First refresh: succeeds and returns a NEW refresh token.
    const refreshed = await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(200);
    const secondRefresh = refreshed.body.data.refreshToken;
    expect(secondRefresh).not.toBe(firstRefresh);

    // Reuse the now-consumed first token: must be rejected as reuse.
    await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(401);

    // Reuse detection revokes the whole family, so the second (previously valid) token is dead.
    await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: secondRefresh })
      .expect(401);
  });

  it('logs out with a valid access token and revokes the session', async () => {
    const login = await request(server())
      .post('/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    const { accessToken, refreshToken } = login.body.data;

    await request(server())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    // The refresh token is dead after logout.
    await request(server())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
