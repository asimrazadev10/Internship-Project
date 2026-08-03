import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';

import { AppModule } from './../src/app.module';
import { TestDb } from './test-db';

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

describe('Online presence (e2e)', () => {
  let app: INestApplication;
  let prisma: TestDb;
  let port: number;
  let memberId: string;
  let member2Id: string;
  let groupId: string;
  let memberToken: string;
  let member2Token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    prisma = new TestDb(app);
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;

    const stamp = Date.now();
    const member = await prisma.user.create({
      data: {
        email: `pres-a-${stamp}@example.com`,
        name: 'PresA',
        password: 'x',
      },
    });
    const member2 = await prisma.user.create({
      data: {
        email: `pres-b-${stamp}@example.com`,
        name: 'PresB',
        password: 'x',
      },
    });
    memberId = member.id;
    member2Id = member2.id;

    const group = await prisma.group.create({
      data: { name: 'Presence Group', createdBy: memberId },
    });
    groupId = group.id;
    await prisma.groupMember.create({
      data: { groupId, userId: memberId, role: 'OWNER' },
    });
    await prisma.groupMember.create({
      data: { groupId, userId: member2Id, role: 'MEMBER' },
    });

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
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({
      where: { id: { in: [memberId, member2Id] } },
    });
    await app.close();
  });

  it('broadcasts presence as members join and leave', async () => {
    const a = await connect(port, memberToken);
    await a.emitWithAck('join_group', { groupId });

    const bothOnline = new Promise<any>((resolve) => {
      a.on('presence', (p) => {
        if (p.groupId === groupId && p.userIds.length === 2) resolve(p);
      });
    });
    const b = await connect(port, member2Token);
    await b.emitWithAck('join_group', { groupId });

    const p = await bothOnline;
    expect([...p.userIds].sort()).toEqual([memberId, member2Id].sort());

    const backToOne = new Promise<any>((resolve) => {
      a.on('presence', (p) => {
        if (p.groupId === groupId && p.userIds.length === 1) resolve(p);
      });
    });
    b.close(); // disconnecting → presence recomputed without b
    const p2 = await backToOne;
    expect(p2.userIds).toEqual([memberId]);

    a.close();
  });
});
