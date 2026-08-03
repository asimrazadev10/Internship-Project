import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import request from 'supertest';
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

describe('Read receipts (e2e)', () => {
  let app: INestApplication;
  let prisma: TestDb;
  let port: number;
  let memberId: string;
  let member2Id: string;
  let outsiderId: string;
  let groupId: string;
  let memberToken: string;
  let member2Token: string;
  let outsiderToken: string;

  const server = () => app.getHttpServer();

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
        email: `read-a-${stamp}@example.com`,
        name: 'ReadA',
        password: 'x',
      },
    });
    const member2 = await prisma.user.create({
      data: {
        email: `read-b-${stamp}@example.com`,
        name: 'ReadB',
        password: 'x',
      },
    });
    const outsider = await prisma.user.create({
      data: {
        email: `read-o-${stamp}@example.com`,
        name: 'ReadO',
        password: 'x',
      },
    });
    memberId = member.id;
    member2Id = member2.id;
    outsiderId = outsider.id;

    const group = await prisma.group.create({
      data: { name: 'Read Group', createdBy: memberId },
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

  it('marks read and surfaces lastReadAt in the group detail', async () => {
    const res = await request(server())
      .post(`/groups/${groupId}/read`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(res.body.data.lastReadAt).toBeTruthy();

    const detail = await request(server())
      .get(`/groups/${groupId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    const me = detail.body.data.members.find(
      (m: any) => m.user.id === memberId,
    );
    expect(me.lastReadAt).toBeTruthy();
  });

  it('broadcasts read_receipt to the room', async () => {
    const b = await connect(port, member2Token);
    await b.emitWithAck('join_group', { groupId });

    const got = new Promise<any>((resolve) => b.once('read_receipt', resolve));
    await request(server())
      .post(`/groups/${groupId}/read`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const evt = await got;
    expect(evt).toMatchObject({ groupId, userId: memberId });
    expect(evt.lastReadAt).toBeTruthy();
    b.close();
  });

  it('refuses mark-read from a non-member (403)', async () => {
    await request(server())
      .post(`/groups/${groupId}/read`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });
});
