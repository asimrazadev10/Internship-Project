import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from './../src/app.module';
import { GroupsService } from './../src/groups/groups.service';
import { PrismaService } from './../src/prisma/prisma.service';

describe('GroupsService leave/transfer (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let groups: GroupsService;
  const userIds: string[] = [];
  const groupIds: string[] = [];

  const mkUser = async (tag: string) => {
    const u = await prisma.user.create({
      data: {
        email: `gm-${tag}-${Date.now()}-${Math.round(performance.now())}@example.com`,
        name: tag,
        password: 'x',
      },
    });
    userIds.push(u.id);
    return u.id;
  };

  // joinedAt is set explicitly so "longest-standing" is deterministic rather than clock-dependent.
  const mkGroup = async (
    owner: string,
    others: { id: string; joinedAt: Date }[] = [],
  ) => {
    const g = await prisma.group.create({
      data: { name: `GM ${Date.now()}-${Math.random()}`, createdBy: owner },
    });
    groupIds.push(g.id);
    await prisma.groupMember.create({
      data: { groupId: g.id, userId: owner, role: 'OWNER' },
    });
    for (const o of others) {
      await prisma.groupMember.create({
        data: {
          groupId: g.id,
          userId: o.id,
          role: 'MEMBER',
          joinedAt: o.joinedAt,
        },
      });
    }
    return g.id;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    prisma = app.get(PrismaService);
    groups = app.get(GroupsService);
    await app.init();
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('a plain member leaving removes only their membership', async () => {
    const owner = await mkUser('own');
    const member = await mkUser('mem');
    const groupId = await mkGroup(owner, [{ id: member, joinedAt: new Date() }]);

    const result = await groups.leave(member, groupId);

    expect(result).toEqual({
      left: true,
      groupDeleted: false,
      newOwnerId: null,
    });
    expect(
      await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: member } },
      }),
    ).toBeNull();
    // The group and its owner are untouched.
    expect(
      await prisma.group.findUnique({ where: { id: groupId } }),
    ).not.toBeNull();
  });

  it('an owner leaving promotes the longest-standing remaining member', async () => {
    const owner = await mkUser('own2');
    const older = await mkUser('older');
    const newer = await mkUser('newer');
    const groupId = await mkGroup(owner, [
      { id: newer, joinedAt: new Date('2026-01-02T00:00:00Z') },
      { id: older, joinedAt: new Date('2026-01-01T00:00:00Z') },
    ]);

    const result = await groups.leave(owner, groupId);

    expect(result).toEqual({
      left: true,
      groupDeleted: false,
      newOwnerId: older,
    });
    const promoted = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: older } },
    });
    expect(promoted?.role).toBe('OWNER');
    // The later joiner is untouched, and the old owner is gone.
    const untouched = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: newer } },
    });
    expect(untouched?.role).toBe('MEMBER');
    expect(
      await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: owner } },
      }),
    ).toBeNull();
  });

  it('the sole member leaving deletes the group and its messages', async () => {
    const owner = await mkUser('solo');
    const groupId = await mkGroup(owner);
    await prisma.message.create({
      data: { groupId, senderId: owner, content: 'bye', type: 'USER' },
    });

    const result = await groups.leave(owner, groupId);

    expect(result).toEqual({
      left: true,
      groupDeleted: true,
      newOwnerId: null,
    });
    expect(await prisma.group.findUnique({ where: { id: groupId } })).toBeNull();
    // Messages cascade from Group, so nothing is orphaned.
    expect(await prisma.message.count({ where: { groupId } })).toBe(0);
  });
});
