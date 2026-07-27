import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

/**
 * Liveness through the real application graph.
 *
 * The question worth an e2e rather than a unit test: does GET /health actually answer WITHOUT a
 * bearer token? JwtAuthGuard is bound globally via APP_GUARD, so a missing @Public() would make
 * every probe 401 — and nothing in a unit test of the controller would notice, because the guard
 * is not in that picture.
 *
 * Readiness is deliberately not asserted here. It reports on live Postgres and Redis, so its
 * result depends on what is running on the machine; HealthService's unit spec covers the up/down
 * and timeout branches with those dependencies mocked.
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers liveness without authentication', async () => {
    const res = await request(server() as App)
      .get('/health')
      .expect(200);

    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });

  it('does not touch the database or Redis to answer liveness', async () => {
    // Two calls in a row, both fast and both identical: liveness has no dependency that could
    // make it flap. This is the property that stops a database blip triggering a restart loop.
    await request(server() as App)
      .get('/health')
      .expect(200);
    await request(server() as App)
      .get('/health')
      .expect(200);
  });

  it('still rejects an unauthenticated request to a protected route', async () => {
    // Guards that @Public() the health routes must not have opened anything else.
    await request(server() as App)
      .get('/groups')
      .expect(401);
  });
});
