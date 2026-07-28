/**
 * HOW THIS FILE WORKS
 *   1. Read the token from the handshake auth payload.
 *   2. Verify it against JWT_ACCESS_SECRET.
 *   3. Attach { userId, email } to socket.data for every later handler.
 *   4. Wrap that in the callback shape Socket.IO middleware expects — next(err) rejects.
 *
 * Middleware, NOT handleConnection: the docblock below explains why that distinction decides
 * whether the client sees connect_error or a spurious connect followed by a disconnect.
 */
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { JwtPayload } from '../auth/interfaces/auth.types';
import type { AuthedSocket } from './ws.types';

/**
 * Handshake authentication for Socket.IO, as middleware.
 *
 * WHY MIDDLEWARE AND NOT `handleConnection` — this is the load-bearing detail, and the reason this
 * file exists as its own unit rather than four lines inside the gateway:
 *
 * Socket.IO's namespace sends the CONNECT ack to the client (which fires the client's `connect`
 * event) BEFORE it emits the internal `connection` event that triggers `handleConnection` — see
 * socket.io's `Namespace._doConnect`, where `socket._onconnect()` runs, THEN
 * `emitReserved('connection', socket)`. So calling `socket.disconnect()` from `handleConnection`
 * always arrives too late: the client has already seen `connect`, and would only later see a
 * `disconnect`, never a `connect_error`.
 *
 * Handshake middleware runs earlier, in `Namespace._run`, strictly before that ack is sent.
 * Calling `next(err)` there makes Socket.IO send a CONNECT_ERROR packet instead, which is what
 * surfaces as `connect_error` on the client — and guarantees an unauthenticated socket never
 * completes the connection at all.
 *
 * A plain factory rather than an @Injectable: it needs no Server reference and holds no state, so
 * it has zero DI friction. The gateway registers it in `afterInit`.
 */
export function createWsAuthMiddleware(jwt: JwtService, config: ConfigService) {
  async function authenticate(socket: AuthedSocket): Promise<void> {
    // Step 1. handshake.auth, not a query param — a URL would land in logs and referrers.
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      throw new Error('Unauthorized: missing token');
    }
    // Step 2. The same ACCESS secret the HTTP strategy uses, so one token works for both.
    const payload = await jwt.verifyAsync<JwtPayload>(token, {
      secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
    // Step 3. Every @SubscribeMessage handler reads identity from here, never from the client.
    socket.data = { userId: payload.sub, email: payload.email };
  }

  // Step 4. Socket.IO middleware is callback-based, so the async work is adapted here.
  return (socket: AuthedSocket, next: (err?: Error) => void): void => {
    authenticate(socket)
      .then(() => next())
      // next(err) produces CONNECT_ERROR — the client never sees a successful connect.
      .catch((err: Error) => next(err));
  };
}
