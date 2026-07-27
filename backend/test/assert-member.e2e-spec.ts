import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from './../src/app.module';
import { GroupsService } from './../src/groups/groups.service';
import { PrismaService } from './../src/prisma/prisma.service';

describe('GroupsService.assertMember (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let groups: GroupsService;
  let memberId: string;
  let outsiderId: string;
  let groupId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    prisma = app.get(PrismaService);
    groups = app.get(GroupsService);
    await app.init();

    const m = await prisma.user.create({
      data: { email: `am-${Date.now()}@example.com`, name: 'M', password: 'x' },
    });
    const o = await prisma.user.create({
      data: { email: `ao-${Date.now()}@example.com`, name: 'O', password: 'x' },
    });
    memberId = m.id;
    outsiderId = o.id;
    const g = await prisma.group.create({
      data: { name: 'AM Group', createdBy: memberId },
    });
    groupId = g.id;
    await prisma.groupMember.create({
      data: { groupId, userId: memberId, role: 'OWNER' },
    });
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({
      where: { id: { in: [memberId, outsiderId] } },
    });
    await app.close();
  });

  // Returns the membership row rather than void, so GroupMemberGuard can stash it on the request
  // for handlers that need the caller's role without issuing a second identical query.
  it('resolves with the membership row for a member', async () => {
    await expect(groups.assertMember(memberId, groupId)).resolves.toMatchObject(
      {
        groupId,
        userId: memberId,
        role: 'OWNER',
      },
    );
  });

  it('throws Forbidden for a non-member', async () => {
    await expect(
      groups.assertMember(outsiderId, groupId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws Forbidden for a malformed group id', async () => {
    await expect(
      groups.assertMember(memberId, 'not-a-uuid'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
