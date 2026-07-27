import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * POST /summaries/run — the manual "run summaries now" trigger.
 *
 * In the distributed design the main app is a PRODUCER only: this endpoint enqueues a scheduler-tick
 * into the summary-scheduler queue and returns. No worker runs inside the API process, so nothing
 * calls Gemini and no AI_SUMMARY rows are written here — the enqueued job simply waits in Redis for
 * the (separately run) scheduler worker. We assert the enqueue contract only.
 */
describe('POST /summaries/run (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const user = {
    email: `summary-e2e-${Date.now()}@example.com`,
    password: 'correct-horse-battery',
    name: 'Summary E2E User',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
    await prisma.user.deleteMany({ where: { email: user.email } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('401s without a token', async () => {
    await request(server()).post('/summaries/run').expect(401);
  });

  it('enqueues a scheduler job for an authenticated user', async () => {
    const register = await request(server())
      .post('/auth/register')
      .send(user)
      .expect(201);
    const accessToken = register.body.data.accessToken;

    const res = await request(server())
      .post('/summaries/run')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(202);

    expect(res.body.success).toBe(true);
    expect(res.body.data.enqueued).toBe(true);
  });
});
