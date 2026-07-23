// AppModule transitively imports AiSummaryService, which imports the ESM-only '@ai-sdk/google'
// package. Mock the vendor modules at the boundary (same pattern as
// summary.processor.spec.ts) BEFORE importing AppModule, so ts-jest's CJS transform never has
// to parse the real ESM source — AiSummaryService itself is still overridden below, but the
// module chain must resolve cleanly just to load AppModule for the Nest testing module.
jest.mock('ai', () => ({ generateText: jest.fn() }));
jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => (model: string) => ({ model }),
}));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { AiSummaryService } from './../src/ai/ai-summary.service';

/**
 * POST /summaries/run — the manual "run summaries now" trigger.
 *
 * The full app boots here, which means the real BullMQ worker (SummaryProcessor) is live and
 * WILL pick up the job this endpoint enqueues. If any group in the (shared, dockerized) dev
 * database happens to be active, that worker would call the real Gemini API — forbidden in
 * automated tests. AiSummaryService is therefore overridden with a stub so no real network
 * call can happen regardless of what the worker does with the enqueued job.
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
    })
      .overrideProvider(AiSummaryService)
      .useValue({ summarize: async () => 'test summary' })
      .compile();

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
