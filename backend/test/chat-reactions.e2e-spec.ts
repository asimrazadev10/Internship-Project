import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

function connect(port: number, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const client = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
    });
    client.on('connect', () => resolve(client));
    client.on('connect_error', (err) => reject(err));
  });
}

describe('Message reactions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;
  let memberId: string;
  let member2Id: string;
  let outsiderId: string;
  let groupId: string;
  let messageId: string;
  let memberToken: string;
  let member2Token: string;
  let outsiderToken: string;

  const server = () => app.getHttpServer();
  const url = () => `/groups/${groupId}/messages/${messageId}/reactions`;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;

    const stamp = Date.now();
    const member = await prisma.user.create({
      data: {
        email: `react-a-${stamp}@example.com`,
        name: 'ReactA',
        password: 'x',
      },
    });
    const member2 = await prisma.user.create({
      data: {
        email: `react-b-${stamp}@example.com`,
        name: 'ReactB',
        password: 'x',
      },
    });
    const outsider = await prisma.user.create({
      data: {
        email: `react-o-${stamp}@example.com`,
        name: 'ReactO',
        password: 'x',
      },
    });
    memberId = member.id;
    member2Id = member2.id;
    outsiderId = outsider.id;

    const group = await prisma.group.create({
      data: { name: 'Reaction Group', createdBy: memberId },
    });
    groupId = group.id;
    await prisma.groupMember.create({
      data: { groupId, userId: memberId, role: 'OWNER' },
    });
    await prisma.groupMember.create({
      data: { groupId, userId: member2Id, role: 'MEMBER' },
    });

    const message = await prisma.message.create({
      data: {
        groupId,
        senderId: memberId,
        content: 'react to me',
        type: 'USER',
      },
    });
    messageId = message.id;

    const jwt = app.get(JwtService);
    const secret = app
      .get(ConfigService)
      .getOrThrow<string>('JWT_ACCESS_SECRET');
    memberToken = await jwt.signAsync(
      { sub: memberId, email: member.email },
      { secret, expiresIn: '5m' },
    );
    member2Token = await jwt.signAsync(
      { sub: member2Id, email: member2.email },
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
      where: { id: { in: [memberId, member2Id, outsiderId] } },
    });
    await app.close();
  });

  it('toggles a reaction on and off', async () => {
    const on = await request(server())
      .post(url())
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ emoji: '👍' })
      .expect(201);
    expect(on.body.data).toEqual([{ emoji: '👍', userId: memberId }]);

    const off = await request(server())
      .post(url())
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ emoji: '👍' })
      .expect(201);
    expect(off.body.data).toEqual([]);
  });

  it('broadcasts reaction_updated to members in the room', async () => {
    const b = await connect(port, member2Token);
    await b.emitWithAck('join_group', { groupId });

    const got = new Promise<any>((resolve) =>
      b.once('reaction_updated', resolve),
    );
    await request(server())
      .post(url())
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ emoji: '🎉' })
      .expect(201);

    const evt = await got;
    expect(evt).toMatchObject({ groupId, messageId });
    expect(evt.reactions).toEqual([{ emoji: '🎉', userId: memberId }]);

    b.close();
    // toggle it back off so the test leaves no state
    await request(server())
      .post(url())
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ emoji: '🎉' });
  });

  it('refuses a reaction from a non-member (403)', async () => {
    await request(server())
      .post(url())
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ emoji: '👍' })
      .expect(403);
  });
});
