import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';

import { AppModule } from './../src/app.module';
import { TestDb } from './test-db';

function connect(port: number, token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const client = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: token ? { token } : {},
      reconnection: false,
    });
    client.on('connect', () => resolve(client));
    client.on('connect_error', (err) => reject(err));
  });
}

describe('Chat send (e2e)', () => {
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

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    prisma = new TestDb(app);
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;

    const member = await prisma.user.create({
      data: {
        email: `wssend-member-${Date.now()}@example.com`,
        name: 'SendMember',
        password: 'x',
      },
    });
    const member2 = await prisma.user.create({
      data: {
        email: `wssend-member2-${Date.now()}@example.com`,
        name: 'SendMember2',
        password: 'x',
      },
    });
    const outsider = await prisma.user.create({
      data: {
        email: `wssend-outsider-${Date.now()}@example.com`,
        name: 'SendOutsider',
        password: 'x',
      },
    });
    memberId = member.id;
    member2Id = member2.id;
    outsiderId = outsider.id;

    const group = await prisma.group.create({
      data: { name: 'Send Group', createdBy: memberId },
    });
    groupId = group.id;
    await prisma.groupMember.create({
      data: { groupId, userId: memberId, role: 'OWNER' },
    });
    await prisma.groupMember.create({
      data: { groupId, userId: member2Id, role: 'MEMBER' },
    });

    const jwt = app.get(JwtService);
    const config = app.get(ConfigService);
    const secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
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

  it('persists and broadcasts to other members in the room', async () => {
    const a = await connect(port, memberToken);
    const b = await connect(port, member2Token);
    await a.emitWithAck('join_group', { groupId });
    await b.emitWithAck('join_group', { groupId });

    const received = new Promise<any>((resolve) =>
      b.on('new_message', resolve),
    );
    const ack = await a.emitWithAck('send_message', {
      groupId,
      content: 'hi over socket',
    });
    expect(ack.ok).toBe(true);

    const msg = await received;
    expect(msg.content).toBe('hi over socket');
    expect(msg.groupId).toBe(groupId);

    const inDb = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(inDb).not.toBeNull();

    a.close();
    b.close();
  });

  it('refuses a send from a non-member', async () => {
    const o = await connect(port, outsiderToken);
    const ack = await o.emitWithAck('send_message', {
      groupId,
      content: 'nope',
    });
    expect(ack.ok).toBe(false);
    o.close();
  });

  it('refuses empty content', async () => {
    const a = await connect(port, memberToken);
    const ack = await a.emitWithAck('send_message', {
      groupId,
      content: '   ',
    });
    expect(ack.ok).toBe(false);
    a.close();
  });

  it('refuses content over 4000 characters', async () => {
    const a = await connect(port, memberToken);
    const ack = await a.emitWithAck('send_message', {
      groupId,
      content: 'x'.repeat(4001),
    });
    expect(ack.ok).toBe(false);
    a.close();
  });
});
