import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Message search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let memberId: string;
  let outsiderId: string;
  let groupId: string;
  let memberToken: string;
  let outsiderToken: string;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();

    const stamp = Date.now();
    const member = await prisma.user.create({
      data: {
        email: `search-a-${stamp}@example.com`,
        name: 'SearchA',
        password: 'x',
      },
    });
    const outsider = await prisma.user.create({
      data: {
        email: `search-o-${stamp}@example.com`,
        name: 'SearchO',
        password: 'x',
      },
    });
    memberId = member.id;
    outsiderId = outsider.id;

    const group = await prisma.group.create({
      data: { name: 'Search Group', createdBy: memberId },
    });
    groupId = group.id;
    await prisma.groupMember.create({
      data: { groupId, userId: memberId, role: 'OWNER' },
    });

    await prisma.message.createMany({
      data: [
        {
          groupId,
          senderId: memberId,
          content: 'Let us deploy the API today',
          type: 'USER',
        },
        {
          groupId,
          senderId: memberId,
          content: 'The DEPLOY pipeline is green',
          type: 'USER',
        },
        { groupId, senderId: memberId, content: 'lunch plans?', type: 'USER' },
        {
          groupId,
          senderId: memberId,
          content: 'deploy this later',
          type: 'USER',
          deletedAt: new Date(),
        },
        {
          groupId,
          senderId: null,
          content: 'Daily summary: deploy discussed',
          type: 'AI_SUMMARY',
        },
      ],
    });

    const jwt = app.get(JwtService);
    const secret = app
      .get(ConfigService)
      .getOrThrow<string>('JWT_ACCESS_SECRET');
    memberToken = await jwt.signAsync(
      { sub: memberId, email: member.email },
      { secret, expiresIn: '5m' },
    );
    outsiderToken = await jwt.signAsync(
      { sub: outsiderId, email: outsider.email },
      { secret, expiresIn: '5m' },
    );
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({
      where: { id: { in: [memberId, outsiderId] } },
    });
    await app.close();
  });

  it('finds matching USER messages case-insensitively', async () => {
    const res = await request(server())
      .get(`/groups/${groupId}/messages/search`)
      .query({ q: 'deploy' })
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const contents: string[] = res.body.data.map(
      (m: { content: string }) => m.content,
    );
    // Both "deploy" (lowercase) and "DEPLOY" (uppercase) match.
    expect(contents).toContain('Let us deploy the API today');
    expect(contents).toContain('The DEPLOY pipeline is green');
    // Not the unrelated message.
    expect(contents).not.toContain('lunch plans?');
  });

  it('excludes deleted and non-USER (AI_SUMMARY) messages', async () => {
    const res = await request(server())
      .get(`/groups/${groupId}/messages/search`)
      .query({ q: 'deploy' })
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const contents: string[] = res.body.data.map(
      (m: { content: string }) => m.content,
    );
    expect(contents).not.toContain('deploy this later'); // soft-deleted
    expect(contents).not.toContain('Daily summary: deploy discussed'); // AI_SUMMARY
    expect(res.body.data).toHaveLength(2);
  });

  it('rejects a blank query (400)', async () => {
    await request(server())
      .get(`/groups/${groupId}/messages/search`)
      .query({ q: '' })
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(400);
  });

  it('refuses a non-member (403)', async () => {
    await request(server())
      .get(`/groups/${groupId}/messages/search`)
      .query({ q: 'deploy' })
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });
});
