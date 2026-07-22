import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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

describe('Chat auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;

    const user = await prisma.user.create({
      data: {
        email: `wsauth-${Date.now()}@example.com`,
        name: 'WsAuth',
        password: 'x',
      },
    });
    userId = user.id;
    const jwt = app.get(JwtService);
    const config = app.get(ConfigService);
    token = await jwt.signAsync(
      { sub: userId, email: user.email },
      { secret: config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: '5m' },
    );
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('connects with a valid token', async () => {
    const client = await connect(port, token);
    expect(client.connected).toBe(true);
    client.close();
  });

  it('rejects a connection with no token', async () => {
    await expect(connect(port)).rejects.toBeDefined();
  });

  it('rejects a connection with a garbage token', async () => {
    await expect(connect(port, 'not-a-jwt')).rejects.toBeDefined();
  });
});
