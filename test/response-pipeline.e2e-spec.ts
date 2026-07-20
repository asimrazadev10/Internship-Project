import { Controller, Get, INestApplication, Module, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Exclude } from 'class-transformer';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

/**
 * Verifies the global response pipeline end to end, before any real endpoint depends on it.
 *
 * The specific question: with two global interceptors bound via APP_INTERCEPTOR, does
 * ClassSerializerInterceptor run BEFORE ResponseInterceptor? If it runs after, it would
 * serialize the envelope rather than the entity and @Exclude() would leak secrets.
 *
 * The NestJS docs specify interceptor ordering across scopes (route, controller, global) but
 * not among multiple global interceptors, so this is settled by observed behaviour.
 *
 * The controller below is a test fixture and exists only in this file.
 */

class ProbeUser {
  id!: string;
  email!: string;
  name!: string;

  // Stands in for the real User.password. If this reaches the wire, the ordering is wrong.
  @Exclude()
  password!: string;

  constructor(partial: Partial<ProbeUser>) {
    Object.assign(this, partial);
  }
}

const makeUser = (id: string) =>
  new ProbeUser({
    id,
    email: `${id}@example.com`,
    name: 'Probe User',
    password: 'LEAKED_PASSWORD_HASH',
  });

@Controller('probe')
class ProbeController {
  /** A bare entity — the ordinary case. */
  @Get('user')
  user(): ProbeUser {
    return makeUser('u1');
  }

  /** Entities nested inside a { data, meta } payload — the pagination case. */
  @Get('paginated')
  paginated() {
    return {
      data: [makeUser('u2'), makeUser('u3')],
      meta: { limit: 20, nextCursor: null, hasMore: false },
    };
  }

  /** Error path — must produce the error envelope, not the success envelope. */
  @Get('boom')
  boom(): never {
    throw new NotFoundException('Group not found');
  }
}

@Module({ imports: [AppModule], controllers: [ProbeController] })
class ProbeModule {}

describe('global response pipeline', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('strips @Exclude() fields AND wraps in the success envelope', async () => {
    const res = await request(app.getHttpServer()).get('/probe/user').expect(200);

    console.log('\n--- GET /probe/user ---\n' + JSON.stringify(res.body, null, 2));

    expect(res.body).toEqual({
      success: true,
      data: { id: 'u1', email: 'u1@example.com', name: 'Probe User' },
    });
    expect(JSON.stringify(res.body)).not.toContain('LEAKED_PASSWORD_HASH');
  });

  it('lifts meta to the envelope and serializes entities nested inside data', async () => {
    const res = await request(app.getHttpServer()).get('/probe/paginated').expect(200);

    console.log('\n--- GET /probe/paginated ---\n' + JSON.stringify(res.body, null, 2));

    expect(res.body.success).toBe(true);
    expect(res.body.meta).toEqual({ limit: 20, nextCursor: null, hasMore: false });
    expect(res.body.data).toHaveLength(2);
    // The decisive assertion: nested instances must still be serialized.
    expect(JSON.stringify(res.body)).not.toContain('LEAKED_PASSWORD_HASH');
  });

  it('produces the error envelope for thrown HttpExceptions', async () => {
    const res = await request(app.getHttpServer()).get('/probe/boom').expect(404);

    console.log('\n--- GET /probe/boom ---\n' + JSON.stringify(res.body, null, 2));

    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Group not found' },
    });
  });
});
