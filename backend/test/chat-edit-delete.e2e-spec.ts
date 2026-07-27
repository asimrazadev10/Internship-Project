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

describe('Edit & delete messages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;
  let memberId: string;
  let member2Id: string;
  let outsiderId: string;
  let groupId: string;
  let memberToken: string;
  let member2Token: string;
  let outsiderToken: string;

  const server = () => app.getHttpServer();
  const newMessage = () =>
    prisma.message.create({
      data: { groupId, senderId: memberId, content: 'original', type: 'USER' },
    });

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
        email: `edit-a-${stamp}@example.com`,
        name: 'EditA',
        password: 'x',
      },
    });
    const member2 = await prisma.user.create({
      data: {
        email: `edit-b-${stamp}@example.com`,
        name: 'EditB',
        password: 'x',
      },
    });
    const outsider = await prisma.user.create({
      data: {
        email: `edit-o-${stamp}@example.com`,
        name: 'EditO',
        password: 'x',
      },
    });
    memberId = member.id;
    member2Id = member2.id;
    outsiderId = outsider.id;

    const group = await prisma.group.create({
      data: { name: 'Edit Group', createdBy: memberId },
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

  it('lets the author edit and broadcasts message_updated', async () => {
    const msg = await newMessage();
    const b = await connect(port, member2Token);
    await b.emitWithAck('join_group', { groupId });
    const got = new Promise<any>((resolve) =>
      b.once('message_updated', resolve),
    );

    const res = await request(server())
      .patch(`/groups/${groupId}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ content: 'edited!' })
      .expect(200);
    expect(res.body.data.content).toBe('edited!');
    expect(res.body.data.editedAt).toBeTruthy();

    const evt = await got;
    expect(evt).toMatchObject({ id: msg.id, content: 'edited!' });
    b.close();
  });

  it('lets the author soft-delete (deletedAt set, content blanked)', async () => {
    const msg = await newMessage();
    const res = await request(server())
      .delete(`/groups/${groupId}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(res.body.data.deletedAt).toBeTruthy();
    expect(res.body.data.content).toBe('');
  });

  it('refuses editing someone else’s message (403)', async () => {
    const msg = await newMessage();
    await request(server())
      .patch(`/groups/${groupId}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${member2Token}`)
      .send({ content: 'hijack' })
      .expect(403);
  });

  it('refuses a non-member editing (403)', async () => {
    const msg = await newMessage();
    await request(server())
      .patch(`/groups/${groupId}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ content: 'nope' })
      .expect(403);
  });
});
