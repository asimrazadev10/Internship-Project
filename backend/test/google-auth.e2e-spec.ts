import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { GoogleService } from './../src/auth/google.service';
import { GoogleIdentity } from './../src/auth/interfaces/auth.types';
import { TestDb } from './test-db';

/**
 * Exercises the Google sign-in flow with only ONE thing stubbed: GoogleService.verify, the step
 * that would need a live Google-issued token. Everything downstream is real — the controller,
 * the account-resolution policy, the database write, JWT issuance and the response envelope.
 *
 * This is the correct test seam: we cannot mint a genuine Google token in a unit test, so we
 * replace exactly that boundary and assert the behaviour we own (new-user creation, returning-
 * user recognition, the email-collision refusal, no password leak).
 */

// A controllable stand-in for GoogleService: tests set `identity`, and verify() returns it.
const fakeGoogle = {
  identity: {
    providerId: 'google-sub-123',
    email: 'google-user@example.com',
    name: 'Google User',
  },
  verify(): Promise<GoogleIdentity> {
    return Promise.resolve(this.identity);
  },
};

describe('Google Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: TestDb;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleService)
      .useValue(fakeGoogle)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    prisma = new TestDb(app);
    await app.init();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: ['google-user@example.com', 'collision@example.com'] },
      },
    });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('creates a new user on first Google sign-in and returns tokens', async () => {
    fakeGoogle.identity = {
      providerId: 'google-sub-123',
      email: 'google-user@example.com',
      name: 'Google User',
    };

    const res = await request(server())
      .post('/auth/google')
      .send({ idToken: 'stub-token' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('google-user@example.com');
    expect(res.body.data.user.provider).toBe('GOOGLE');
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    // OAuth-only account: no password anywhere in the response, and providerId is excluded too.
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.providerId).toBeUndefined();
  });

  it('recognises the returning Google user without creating a duplicate', async () => {
    const before = await prisma.user.count({
      where: { email: 'google-user@example.com' },
    });

    const res = await request(server())
      .post('/auth/google')
      .send({ idToken: 'stub-token' })
      .expect(200);
    expect(res.body.data.user.email).toBe('google-user@example.com');

    const after = await prisma.user.count({
      where: { email: 'google-user@example.com' },
    });
    expect(after).toBe(before); // same user, no new row
  });

  it('refuses to auto-link when the email already belongs to a local account', async () => {
    // Register a LOCAL account first.
    await request(server())
      .post('/auth/register')
      .send({
        email: 'collision@example.com',
        password: 'local-password',
        name: 'Local User',
      })
      .expect(201);

    // Google sign-in presenting the same email but a different provider subject.
    fakeGoogle.identity = {
      providerId: 'google-sub-999',
      email: 'collision@example.com',
      name: 'Google Impostor',
    };

    const res = await request(server())
      .post('/auth/google')
      .send({ idToken: 'stub-token' })
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects a request with no idToken (validation)', async () => {
    const res = await request(server())
      .post('/auth/google')
      .send({})
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
