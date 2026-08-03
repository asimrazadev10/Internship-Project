import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from './../src/app.module';
import { GroupsService } from './../src/groups/groups.service';
import { TestDb } from './test-db';

/**
 * @@unique([createdBy, name]) — a user cannot create the same group twice.
 *
 * Exercised through GroupsService rather than the raw Prisma client, because the behaviour under
 * test is not only "the database rejects it" but "the rejection becomes a 409 with a message that
 * says something useful". The generic P2002 mapping would have answered "A record with this
 * createdBy, name already exists", which leaks column names.
 */
describe('Group name uniqueness (e2e)', () => {
  let app: INestApplication;
  let prisma: TestDb;
  let groups: GroupsService;
  let ownerId: string;
  let otherId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    prisma = new TestDb(app);
    groups = app.get(GroupsService);
    await app.init();

    const a = await prisma.user.create({
      data: {
        email: `gu-a-${Date.now()}@example.com`,
        name: 'A',
        password: 'x',
      },
    });
    const b = await prisma.user.create({
      data: {
        email: `gu-b-${Date.now()}@example.com`,
        name: 'B',
        password: 'x',
      },
    });
    ownerId = a.id;
    otherId = b.id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { in: [ownerId, otherId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await app.close();
  });

  it('rejects a second group with the same name from the same creator', async () => {
    await groups.create(ownerId, 'Duplicate Test');
    await expect(
      groups.create(ownerId, 'Duplicate Test'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('leaves no orphan group behind when the duplicate is rejected', async () => {
    // The create is a transaction (group + OWNER membership). A failed second attempt must roll
    // back entirely rather than leaving a half-written row.
    const count = await prisma.group.count({
      where: { createdBy: ownerId, name: 'Duplicate Test' },
    });
    expect(count).toBe(1);
  });

  it('allows a DIFFERENT user to use the same group name', async () => {
    // Scoped to the creator, not global — the first person to claim a common word must not deny
    // it to everyone else.
    await expect(
      groups.create(otherId, 'Duplicate Test'),
    ).resolves.toMatchObject({ name: 'Duplicate Test', createdBy: otherId });
  });

  it('allows the same creator to use a different name', async () => {
    await expect(groups.create(ownerId, 'Another Name')).resolves.toMatchObject(
      {
        name: 'Another Name',
      },
    );
  });
});
