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

import { NOT_A_MEMBER_MESSAGE } from '../common/error-messages';
import { MEMBER_JOINED, READ_MARKED } from '../groups/group-events';
import type {
  MemberJoinedPayload,
  ReadMarkedPayload,
} from '../groups/group-events';
import { GroupsService } from '../groups/groups.service';
import {
  MESSAGE_CREATED,
  MESSAGE_UPDATED,
  REACTION_CHANGED,
} from '../messages/message-events';
import type {
  MessageCreatedPayload,
  MessageUpdatedPayload,
  ReactionChangedPayload,
} from '../messages/message-events';
import { MESSAGE_CONTENT_MAX_LENGTH } from '../messages/message.constants';
import { MessagesService } from '../messages/messages.service';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  groupIdFromRoom,
  roomFor,
} from './chat.constants';
import { PresenceService } from './presence.service';
import { createWsAuthMiddleware } from './ws-auth.middleware';
import type { AuthData, AuthedSocket } from './ws.types';

/**
 * Real-time chat gateway: the socket API's INBOUND half (@SubscribeMessage handlers) plus the
 * single outbound broadcast point (@OnEvent handlers at the bottom).
 *
 * CORS is set because the browser connects directly to this server (WebSockets don't traverse the
 * Next proxy). CORS itself is sourced from validated config in RedisIoAdapter (see
 * redis-io.adapter.ts), not here — the decorator below evaluates at import time, before
 * ConfigModule has loaded .env, so a value set here would be stale.
 *
 * Two concerns live in their own files because each carries an argument worth reading on its own:
 *   ws-auth.middleware.ts — WHY handshake middleware and not handleConnection (a Socket.IO
 *                           lifecycle detail that is easy to get wrong and silent when wrong)
 *   presence.service.ts   — WHY fetchSockets and not a local Map (multi-node correctness)
 *
 * The @OnEvent broadcast handlers deliberately STAY here. Each is a single
 * `server.to(room).emit(...)` line, and the Server they need is owned by this class via
 * @WebSocketServer(). Moving them out would mean binding the Server into another provider at
 * startup — real indirection bought for no reduction in complexity.
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
    private readonly presence: PresenceService,
  ) {}

  afterInit(server: Server): void {
    server.use(createWsAuthMiddleware(this.jwt, this.config));
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
        const groupId = groupIdFromRoom(room);
        if (groupId) {
          void this.presence.broadcast(this.server, groupId, socket.id);
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
  @SubscribeMessage(CLIENT_EVENTS.JOIN_GROUP)
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
      await this.presence.broadcast(this.server, groupId);
      return { ok: true };
    } catch (err) {
      if (err instanceof ForbiddenException) {
        return { ok: false, error: NOT_A_MEMBER_MESSAGE };
      }
      this.logger.error(
        'joinGroup failed',
        err instanceof Error ? err.stack : String(err),
      );
      return { ok: false, error: 'Something went wrong' };
    }
  }

  @SubscribeMessage(CLIENT_EVENTS.LEAVE_GROUP)
  async leaveGroup(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { groupId?: string },
  ): Promise<{ ok: true }> {
    if (body?.groupId) {
      await socket.leave(roomFor(body.groupId));
      this.logger.debug(`socket ${socket.id} left ${roomFor(body.groupId)}`);
      await this.presence.broadcast(this.server, body.groupId);
    }
    return { ok: true };
  }

  /**
   * Typing indicators — ephemeral, no DB. Relayed only if this socket is actually in the group's
   * room (it got there via join_group, which already checked membership), so there is no
   * per-keystroke database hit. `socket.to(room)` excludes the sender, so you never see your own
   * "typing…". The client throttles these to one start + one stop per typing burst.
   */
  @SubscribeMessage(CLIENT_EVENTS.TYPING_START)
  handleTypingStart(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { groupId?: string },
  ): void {
    this.relayTyping(socket, body?.groupId, true);
  }

  @SubscribeMessage(CLIENT_EVENTS.TYPING_STOP)
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
    socket
      .to(roomFor(groupId))
      .emit(SERVER_EVENTS.USER_TYPING, { groupId, userId, typing });
  }

  /**
   * Persist-then-broadcast: this handler only writes the row (via MessagesService.create, which
   * emits MESSAGE_CREATED). It never touches `server` directly — the @OnEvent handler below is
   * the single broadcast point, so a socket send and a REST POST end up on the exact same path.
   */
  @SubscribeMessage(CLIENT_EVENTS.SEND_MESSAGE)
  async sendMessage(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { groupId?: string; content?: string },
  ) {
    const { userId } = socket.data as AuthData;
    const groupId = body?.groupId ?? '';
    const content = (body?.content ?? '').trim();
    if (!content || content.length > MESSAGE_CONTENT_MAX_LENGTH) {
      return {
        ok: false as const,
        error: `Message must be 1–${MESSAGE_CONTENT_MAX_LENGTH} characters`,
      };
    }
    try {
      await this.groups.assertMember(userId, groupId);
    } catch (err) {
      if (err instanceof ForbiddenException) {
        return { ok: false as const, error: NOT_A_MEMBER_MESSAGE };
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
      .emit(SERVER_EVENTS.NEW_MESSAGE, payload.message);
  }

  /** An edited or deleted message — push the new version so clients replace it in place. */
  @OnEvent(MESSAGE_UPDATED)
  broadcastMessageUpdated(payload: MessageUpdatedPayload): void {
    this.server
      .to(roomFor(payload.message.groupId))
      .emit(SERVER_EVENTS.MESSAGE_UPDATED, payload.message);
  }

  /**
   * Membership's equivalent of the message broadcast. When someone joins (emitted by
   * GroupsService.join), tell everyone currently in the group's room so their member list/count
   * updates live — the same push philosophy as new messages, no client refresh.
   */
  @OnEvent(MEMBER_JOINED)
  broadcastMemberJoined(payload: MemberJoinedPayload): void {
    this.server
      .to(roomFor(payload.groupId))
      .emit(SERVER_EVENTS.MEMBER_JOINED, payload);
  }

  /** A message's reactions changed — push the new set to everyone viewing the group. */
  @OnEvent(REACTION_CHANGED)
  broadcastReaction(payload: ReactionChangedPayload): void {
    this.server
      .to(roomFor(payload.groupId))
      .emit(SERVER_EVENTS.REACTION_UPDATED, payload);
  }

  /** A member marked the group read — tell the room so "seen" indicators update live. */
  @OnEvent(READ_MARKED)
  broadcastRead(payload: ReadMarkedPayload): void {
    this.server
      .to(roomFor(payload.groupId))
      .emit(SERVER_EVENTS.READ_RECEIPT, payload);
  }
}
