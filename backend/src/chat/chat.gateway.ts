import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

import { JwtPayload } from '../auth/interfaces/auth.types';
import { AuthData, AuthedSocket } from './ws.types';

/**
 * Real-time chat gateway. Authenticates the handshake JWT and (later tasks) manages one room
 * per group and broadcasts new messages. CORS is set because the browser connects directly to
 * this server (WebSockets don't traverse the Next proxy).
 *
 * Auth runs as Socket.IO handshake middleware (registered in `afterInit`), NOT inside
 * `handleConnection`. Socket.IO's namespace sends the CONNECT ack to the client (which fires the
 * client's `connect` event) BEFORE it emits the internal `connection` event that triggers
 * `handleConnection` (see socket.io `Namespace._doConnect`: `socket._onconnect()` runs, THEN
 * `emitReserved('connection', socket)`). So calling `socket.disconnect()` from `handleConnection`
 * always arrives too late — the client already saw `connect` and would only later see a
 * `disconnect`, never `connect_error`. Handshake middleware runs earlier, in `Namespace._run`,
 * strictly before that ack is sent: calling `next(err)` there makes Socket.IO send a
 * CONNECT_ERROR packet instead, which is what surfaces as `connect_error` on the client and
 * guarantees an unauthenticated socket never completes the connection at all.
 */
@WebSocketGateway({
  cors: { origin: process.env.SOCKET_CORS_ORIGIN ?? 'http://localhost:3001' },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server): void {
    server.use((socket: AuthedSocket, next: (err?: Error) => void) => {
      this.authenticate(socket)
        .then(() => next())
        .catch((err: Error) => next(err));
    });
  }

  private async authenticate(socket: AuthedSocket): Promise<void> {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      throw new Error('Unauthorized: missing token');
    }
    const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
    socket.data = { userId: payload.sub, email: payload.email };
  }

  handleConnection(socket: AuthedSocket): void {
    // By this point handshake middleware has already verified the token and set socket.data.
    // Cast explicitly: AuthedSocket['data'] resolves to `any` because it intersects with the
    // base Socket type's own `data: any` field, so a plain read would be an unsafe member access.
    const { userId } = socket.data as AuthData;
    this.logger.log(`socket ${socket.id} connected as user ${userId}`);
  }

  handleDisconnect(socket: AuthedSocket): void {
    // Socket.IO auto-leaves rooms on disconnect; nothing to clean up yet.
    this.logger.debug(`socket ${socket.id} disconnected`);
  }
}
