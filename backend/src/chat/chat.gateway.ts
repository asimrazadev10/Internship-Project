import { ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

import { JwtPayload } from '../auth/interfaces/auth.types';
import { MEMBER_JOINED } from '../groups/group-events';
import type { MemberJoinedPayload } from '../groups/group-events';
import { GroupsService } from '../groups/groups.service';
import { MESSAGE_CREATED } from '../messages/message-events';
import type { MessageCreatedPayload } from '../messages/message-events';
import { REACTION_CHANGED } from '../messages/reaction-events';
import type { ReactionChangedPayload } from '../messages/reaction-events';
import { MessagesService } from '../messages/messages.service';
import { roomFor } from './chat.constants';
import type { AuthData, AuthedSocket } from './ws.types';

/**
 * Real-time chat gateway. Authenticates the handshake JWT and (later tasks) manages one room
 * per group and broadcasts new messages. CORS is set because the browser connects directly to
 * this server (WebSockets don't traverse the Next proxy). CORS itself is sourced from validated
 * config in RedisIoAdapter (see redis-io.adapter.ts), not here — the decorator below evaluates at
 * import time, before ConfigModule has loaded .env, so a value set here would be stale.
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
@WebSocketGateway()
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly groups: GroupsService,
    private readonly messages: MessagesService,
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
    // Refresh presence for every group room this socket was in when it goes away. On the
    // 'disconnecting' event the socket is still listed in its rooms, so exclude it explicitly.
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('group:')) {
          void this.broadcastPresence(room.slice('group:'.length), socket.id);
        }
      }
    });
  }

  handleDisconnect(socket: AuthedSocket): void {
    // Socket.IO auto-leaves rooms on disconnect; nothing to clean up yet.
    this.logger.debug(`socket ${socket.id} disconnected`);
  }

  /**
   * Membership is re-checked here (not just trusted from handshake auth) because the handshake
   * only proves who the user is, not which groups they may currently read/write — that can
   * change after connection. Same rule as the HTTP GroupMemberGuard, via the shared
   * GroupsService.assertMember.
   */
  @SubscribeMessage('join_group')
  async joinGroup(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { groupId?: string },
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const { userId } = socket.data as AuthData;
    const groupId = body?.groupId ?? '';
    try {
      await this.groups.assertMember(userId, groupId);
      await socket.join(roomFor(groupId));
      this.logger.debug(
        `socket ${socket.id} (user ${userId}) joined ${roomFor(groupId)}`,
      );
      await this.broadcastPresence(groupId);
      return { ok: true };
    } catch (err) {
      if (err instanceof ForbiddenException) {
        return { ok: false, error: 'You are not a member of this group' };
      }
      this.logger.error(
        'joinGroup failed',
        err instanceof Error ? err.stack : String(err),
      );
      return { ok: false, error: 'Something went wrong' };
    }
  }

  @SubscribeMessage('leave_group')
  async leaveGroup(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { groupId?: string },
  ): Promise<{ ok: true }> {
    if (body?.groupId) {
      await socket.leave(roomFor(body.groupId));
      this.logger.debug(`socket ${socket.id} left ${roomFor(body.groupId)}`);
      await this.broadcastPresence(body.groupId);
    }
    return { ok: true };
  }

  /**
   * Typing indicators — ephemeral, no DB. Relayed only if this socket is actually in the group's
   * room (it got there via join_group, which already checked membership), so there is no
   * per-keystroke database hit. `socket.to(room)` excludes the sender, so you never see your own
   * "typing…". The client throttles these to one start + one stop per typing burst.
   */
  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { groupId?: string },
  ): void {
    this.relayTyping(socket, body?.groupId, true);
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { groupId?: string },
  ): void {
    this.relayTyping(socket, body?.groupId, false);
  }

  private relayTyping(
    socket: AuthedSocket,
    groupId: string | undefined,
    typing: boolean,
  ): void {
    if (!groupId || !socket.rooms.has(roomFor(groupId))) return;
    const { userId } = socket.data as AuthData;
    socket.to(roomFor(groupId)).emit('user_typing', { groupId, userId, typing });
  }

  /**
   * Presence: the distinct users with at least one socket in the group's room. Uses the adapter's
   * fetchSockets(), which spans nodes under the Redis adapter, so the count is correct multi-node.
   */
  private async broadcastPresence(
    groupId: string,
    excludeSocketId?: string,
  ): Promise<void> {
    const room = roomFor(groupId);
    const sockets = await this.server.in(room).fetchSockets();
    const userIds = [
      ...new Set(
        sockets
          .filter((s) => s.id !== excludeSocketId)
          .map((s) => (s.data as AuthData)?.userId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    this.server.to(room).emit('presence', { groupId, userIds });
  }

  /**
   * Persist-then-broadcast: this handler only writes the row (via MessagesService.create, which
   * emits MESSAGE_CREATED). It never touches `server` directly — the @OnEvent handler below is
   * the single broadcast point, so a socket send and a REST POST end up on the exact same path.
   */
  @SubscribeMessage('send_message')
  async sendMessage(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { groupId?: string; content?: string },
  ) {
    const { userId } = socket.data as AuthData;
    const groupId = body?.groupId ?? '';
    const content = (body?.content ?? '').trim();
    if (!content || content.length > 4000) {
      return { ok: false as const, error: 'Message must be 1–4000 characters' };
    }
    try {
      await this.groups.assertMember(userId, groupId);
    } catch (err) {
      if (err instanceof ForbiddenException) {
        return {
          ok: false as const,
          error: 'You are not a member of this group',
        };
      }
      this.logger.error(
        'sendMessage failed',
        err instanceof Error ? err.stack : String(err),
      );
      return { ok: false as const, error: 'Something went wrong' };
    }
    const message = await this.messages.create(groupId, userId, content);
    return { ok: true as const, message };
  }

  /**
   * The single broadcast point. Fires for socket sends, the REST POST, and Phase 4 AI messages —
   * every path that persists a message. `server.to(room)` reaches all members including the
   * sender, so the sender's own message arrives through the same broadcast, not a separate echo.
   */
  @OnEvent(MESSAGE_CREATED)
  broadcastMessage(payload: MessageCreatedPayload): void {
    this.server
      .to(roomFor(payload.message.groupId))
      .emit('new_message', payload.message);
  }

  /**
   * Membership's equivalent of the message broadcast. When someone joins (emitted by
   * GroupsService.join), tell everyone currently in the group's room so their member list/count
   * updates live — the same push philosophy as new messages, no client refresh.
   */
  @OnEvent(MEMBER_JOINED)
  broadcastMemberJoined(payload: MemberJoinedPayload): void {
    this.server.to(roomFor(payload.groupId)).emit('member_joined', payload);
  }

  /** A message's reactions changed — push the new set to everyone viewing the group. */
  @OnEvent(REACTION_CHANGED)
  broadcastReaction(payload: ReactionChangedPayload): void {
    this.server.to(roomFor(payload.groupId)).emit('reaction_updated', payload);
  }
}
