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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Typing indicators (e2e)', () => {
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
        email: `typing-a-${stamp}@example.com`,
        name: 'TypeA',
        password: 'x',
      },
    });
    const member2 = await prisma.user.create({
      data: {
        email: `typing-b-${stamp}@example.com`,
        name: 'TypeB',
        password: 'x',
      },
    });
    memberId = member.id;
    member2Id = member2.id;

    const group = await prisma.group.create({
      data: { name: 'Typing Group', createdBy: memberId },
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

  it('relays typing_start then typing_stop to other members in the room', async () => {
    const a = await connect(port, memberToken);
    const b = await connect(port, member2Token);
    await a.emitWithAck('join_group', { groupId });
    await b.emitWithAck('join_group', { groupId });

    const started = new Promise<any>((resolve) =>
      b.once('user_typing', resolve),
    );
    a.emit('typing_start', { groupId });
    expect(await started).toMatchObject({
      groupId,
      userId: memberId,
      typing: true,
    });

    const stopped = new Promise<any>((resolve) =>
      b.once('user_typing', resolve),
    );
    a.emit('typing_stop', { groupId });
    expect(await stopped).toMatchObject({ userId: memberId, typing: false });

    a.close();
    b.close();
  });

  it('does not echo typing back to the sender', async () => {
    const a = await connect(port, memberToken);
    await a.emitWithAck('join_group', { groupId });
    let echoed = false;
    a.on('user_typing', () => {
      echoed = true;
    });
    a.emit('typing_start', { groupId });
    await wait(300);
    expect(echoed).toBe(false);
    a.close();
  });

  it('ignores typing for a room the socket has not joined', async () => {
    const a = await connect(port, memberToken); // member, but never joins
    const b = await connect(port, member2Token);
    await b.emitWithAck('join_group', { groupId });
    let leaked = false;
    b.on('user_typing', () => {
      leaked = true;
    });
    a.emit('typing_start', { groupId });
    await wait(300);
    expect(leaked).toBe(false);
    a.close();
    b.close();
  });
});
