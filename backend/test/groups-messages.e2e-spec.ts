import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { TestDb } from './test-db';

/**
 * Groups + messages: the membership authorization boundary and cursor pagination.
 *
 * Two users — an owner and an outsider — prove the guard: the outsider is refused reads and
 * posts until they join. Pagination is walked page by page to prove it returns every message
 * exactly once, newest first, with a working nextCursor.
 */
describe('Groups & Messages (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: TestDb;

  const stamp = Date.now();
  const owner = {
    email: `owner-${stamp}@example.com`,
    password: 'owner-pass-123',
    name: 'Owner',
  };
  const outsider = {
    email: `outsider-${stamp}@example.com`,
    password: 'outsider-pass-123',
    name: 'Outsider',
  };

  let ownerToken: string;
  let outsiderToken: string;
  let groupId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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
    prisma = new TestDb(app);
    await app.init();

    ownerToken = (
      await request(app.getHttpServer()).post('/auth/register').send(owner)
    ).body.data.accessToken;
    outsiderToken = (
      await request(app.getHttpServer()).post('/auth/register').send(outsider)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    // Order matters: Group.createdBy is onDelete: Restrict, so the owner cannot be deleted
    // while they still own a group. Delete the group first — that cascades its memberships and
    // messages — which releases the restriction, then delete the users.
    if (groupId) {
      await prisma.group.deleteMany({ where: { id: groupId } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [owner.email, outsider.email] } },
    });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('requires authentication to list groups', async () => {
    await request(server()).get('/groups').expect(401);
  });

  it('creates a group and makes the creator its OWNER', async () => {
    const res = await request(server())
      .post('/groups')
      .set(auth(ownerToken))
      .send({ name: 'Engineering' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Engineering');
    groupId = res.body.data.id;

    // The creator shows up as OWNER in the detail view.
    const detail = await request(server())
      .get(`/groups/${groupId}`)
      .set(auth(ownerToken))
      .expect(200);
    const ownerMember = detail.body.data.members.find(
      (m: { user: { email: string } }) => m.user.email === owner.email,
    );
    expect(ownerMember.role).toBe('OWNER');
  });

  it('lists only the caller’s own groups', async () => {
    const res = await request(server())
      .get('/groups')
      .set(auth(ownerToken))
      .expect(200);
    expect(res.body.data.some((g: { id: string }) => g.id === groupId)).toBe(
      true,
    );

    // The outsider is in no groups yet.
    const outsiderGroups = await request(server())
      .get('/groups')
      .set(auth(outsiderToken))
      .expect(200);
    expect(outsiderGroups.body.data).toHaveLength(0);
  });

  it('forbids a non-member from reading or posting', async () => {
    await request(server())
      .get(`/groups/${groupId}`)
      .set(auth(outsiderToken))
      .expect(403);
    await request(server())
      .post(`/groups/${groupId}/messages`)
      .set(auth(outsiderToken))
      .send({ content: 'let me in' })
      .expect(403);
  });

  it('lets a user join, then blocks a double join', async () => {
    await request(server())
      .post(`/groups/${groupId}/join`)
      .set(auth(outsiderToken))
      .expect(200);

    // Now a member: the read succeeds.
    await request(server())
      .get(`/groups/${groupId}`)
      .set(auth(outsiderToken))
      .expect(200);

    // Joining again conflicts on @@unique([groupId, userId]).
    const dup = await request(server())
      .post(`/groups/${groupId}/join`)
      .set(auth(outsiderToken))
      .expect(409);
    expect(dup.body.error.code).toBe('CONFLICT');
  });

  it('rejects an empty message (validation)', async () => {
    const res = await request(server())
      .post(`/groups/${groupId}/messages`)
      .set(auth(ownerToken))
      .send({ content: '' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('posts messages and never leaks the sender password', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await request(server())
        .post(`/groups/${groupId}/messages`)
        .set(auth(ownerToken))
        .send({ content: `message ${i}` })
        .expect(201);
      expect(res.body.data.sender.id).toEqual(expect.any(String));
      expect(res.body.data.sender.password).toBeUndefined();
    }
  });

  it('paginates history newest-first, each message exactly once', async () => {
    const collected: { id: string; content: string }[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const url = `/groups/${groupId}/messages?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await request(server())
        .get(url)
        .set(auth(ownerToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.meta.limit).toBe(2);
      collected.push(...res.body.data);
      cursor = res.body.meta.nextCursor;
      pages++;
      if (pages > 10) throw new Error('pagination did not terminate');
    } while (cursor);

    // 5 messages over pages of 2 → 3 pages, all 5 returned once.
    expect(pages).toBe(3);
    expect(collected).toHaveLength(5);
    expect(new Set(collected.map((m) => m.id)).size).toBe(5);

    // Newest first: the last-created message ("message 5") leads.
    expect(collected[0].content).toBe('message 5');
    expect(collected[4].content).toBe('message 1');
  });

  it('rejects a malformed cursor with 400', async () => {
    const res = await request(server())
      .get(`/groups/${groupId}/messages?cursor=not-a-real-cursor`)
      .set(auth(ownerToken))
      .expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});
