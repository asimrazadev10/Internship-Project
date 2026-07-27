import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

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

describe('Chat rooms (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;
  let memberId: string;
  let outsiderId: string;
  let groupId: string;
  let memberToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;

    const member = await prisma.user.create({
      data: {
        email: `wsroom-member-${Date.now()}@example.com`,
        name: 'RoomMember',
        password: 'x',
      },
    });
    const outsider = await prisma.user.create({
      data: {
        email: `wsroom-outsider-${Date.now()}@example.com`,
        name: 'RoomOutsider',
        password: 'x',
      },
    });
    memberId = member.id;
    outsiderId = outsider.id;

    const group = await prisma.group.create({
      data: { name: 'Room Group', createdBy: memberId },
    });
    groupId = group.id;
    await prisma.groupMember.create({
      data: { groupId, userId: memberId, role: 'OWNER' },
    });

    const jwt = app.get(JwtService);
    const config = app.get(ConfigService);
    const secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
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

  it('lets a member join', async () => {
    const client = await connect(port, memberToken);
    const ack = await client.emitWithAck('join_group', { groupId });
    expect(ack).toEqual({ ok: true });
    client.close();
  });

  it('refuses a non-member', async () => {
    const client = await connect(port, outsiderToken);
    const ack = await client.emitWithAck('join_group', { groupId });
    expect(ack.ok).toBe(false);
    client.close();
  });

  it('lets a member leave a joined group', async () => {
    const client = await connect(port, memberToken);
    const joinAck = await client.emitWithAck('join_group', { groupId });
    expect(joinAck).toEqual({ ok: true });
    const leaveAck = await client.emitWithAck('leave_group', { groupId });
    expect(leaveAck).toEqual({ ok: true });
    client.close();
  });
});
