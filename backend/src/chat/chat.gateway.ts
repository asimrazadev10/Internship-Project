/**
 * HOW THIS FILE WORKS
 *   1. afterInit() registers the handshake auth middleware on the server.
 *   2. handleConnection() logs the socket and wires a 'disconnecting' hook to refresh presence.
 *   3. join_group / leave_group — re-check membership, join or leave the room, rebroadcast presence.
 *   4. typing_start / typing_stop — ephemeral relay, no database, sender excluded.
 *   5. send_message — validate, re-check membership, then PERSIST only. It never emits.
 *   6. The @OnEvent handlers at the bottom are the single outbound broadcast point.
 *
 * Inbound handlers write; outbound broadcasting happens only in step 6, so a socket send and a
 * REST POST converge on exactly the same path.
 */
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
import {
  MEMBER_JOINED,
  MEMBER_LEFT,
  OWNER_CHANGED,
  READ_MARKED,
} from '../groups/group-events';
import type {
  MemberJoinedPayload,
  MemberLeftPayload,
  OwnerChangedPayload,
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
// Empty options on purpose — CORS is applied in RedisIoAdapter, where config is available.
@WebSocketGateway()
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  // `!` because Nest assigns it after construction. This is the Server PresenceService borrows.
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    // Supplies assertMember, the same rule the HTTP guard uses.
    private readonly groups: GroupsService,
    private readonly messages: MessagesService,
    private readonly presence: PresenceService,
  ) {}

  afterInit(server: Server): void {
    // Step 1. server.use registers handshake middleware, which runs before any connection completes.
    // When the chat feature is disabled (SERVICE_CHAT_ENABLED=false), refuse every handshake up
    // front — the WebSocket has no HTTP request, so the global FeatureGateGuard never sees it and
    // the gateway must gate itself.
    if (!this.config.get<boolean>('SERVICE_CHAT_ENABLED', true)) {
      this.logger.warn(
        'chat is disabled by SERVICE_CHAT_ENABLED=false — refusing connections',
      );
      server.use((socket, next) => next(new Error('chat is disabled')));
      return;
    }
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
    // Step 2. 'disconnecting', not 'disconnect' — by 'disconnect' the rooms are already gone.
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        // Filters out the socket's own private room, which is not a group.
        const groupId = groupIdFromRoom(room);
        if (groupId) {
          // `void` — presence is best-effort and must not block teardown.
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
    // Identity comes from socket.data, never from the client's payload.
    const { userId } = socket.data as AuthData;
    const groupId = body?.groupId ?? '';
    try {
      // Step 3. The authorisation check — joining a room is what grants the client the feed.
      await this.groups.assertMember(userId, groupId);
      await socket.join(roomFor(groupId));
      this.logger.debug(
        `socket ${socket.id} (user ${userId}) joined ${roomFor(groupId)}`,
      );
      // Tell the room someone arrived, so member lists update live.
      await this.presence.broadcast(this.server, groupId);
      // An ack object, not a thrown error — socket handlers have no HTTP status to return.
      return { ok: true };
    } catch (err) {
      // A genuine authorisation failure gets the shared message, so HTTP and WS agree.
      if (err instanceof ForbiddenException) {
        return { ok: false, error: NOT_A_MEMBER_MESSAGE };
      }
      this.logger.error(
        'joinGroup failed',
        err instanceof Error ? err.stack : String(err),
      );
      // Anything unexpected is logged in full but reported generically.
      return { ok: false, error: 'Something went wrong' };
    }
  }

  @SubscribeMessage(CLIENT_EVENTS.LEAVE_GROUP)
  async leaveGroup(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { groupId?: string },
  ): Promise<{ ok: true }> {
    // No membership check: leaving a room you are not in is harmless.
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
    // Step 4. Room membership IS the authorisation check here — no query, so keystrokes are free.
    if (!groupId || !socket.rooms.has(roomFor(groupId))) return;
    const { userId } = socket.data as AuthData;
    // socket.to(...) rather than server.to(...) — this excludes the sender.
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
    // Trimmed here because no ValidationPipe runs on socket payloads — this path must self-validate.
    const content = (body?.content ?? '').trim();
    // The same bound the HTTP DTO enforces, imported rather than repeated.
    if (!content || content.length > MESSAGE_CONTENT_MAX_LENGTH) {
      return {
        ok: false as const,
        error: `Message must be 1–${MESSAGE_CONTENT_MAX_LENGTH} characters`,
      };
    }
    try {
      // Step 5. Re-checked even though join_group already did — membership can change mid-session.
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
    // Writes and emits MESSAGE_CREATED internally; the broadcast happens in the handler below.
    const message = await this.messages.create(groupId, userId, content);
    // The ack lets the sender resolve its optimistic update; the room copy arrives via broadcast.
    return { ok: true as const, message };
  }

  /**
   * The single broadcast point. Fires for socket sends, the REST POST, and Phase 4 AI messages —
   * every path that persists a message. `server.to(room)` reaches all members including the
   * sender, so the sender's own message arrives through the same broadcast, not a separate echo.
   */
  // Step 6. @OnEvent decouples the writer from the broadcaster — the service need not know a
  // gateway exists. Note the AI pipeline reaches this same event name via Redis instead.
  @OnEvent(MESSAGE_CREATED)
  broadcastMessage(payload: MessageCreatedPayload): void {
    this.server
      .to(roomFor(payload.message.groupId))
      .emit(SERVER_EVENTS.NEW_MESSAGE, payload.message);
  }

  /** An edited or deleted message — push the new version so clients replace it in place. */
  @OnEvent(MESSAGE_UPDATED)
  broadcastMessageUpdated(payload: MessageUpdatedPayload): void {
    // A separate event from NEW_MESSAGE so the client replaces rather than appends.
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

  /**
   * A member left — tell the room, then force that user's sockets out of it.
   *
   * The eviction is the load-bearing half. Sockets join `group:<id>` on join_group and nothing
   * else ever removes them, so a user who left over HTTP would keep receiving every message in
   * the group until they happened to disconnect. Membership is checked once, at join time.
   *
   * fetchSockets() spans nodes under the Redis adapter, so this holds multi-instance — the same
   * reason PresenceService uses it instead of a local Map.
   */
  @OnEvent(MEMBER_LEFT)
  async broadcastMemberLeft(payload: MemberLeftPayload): Promise<void> {
    const room = roomFor(payload.groupId);
    this.server.to(room).emit(SERVER_EVENTS.MEMBER_LEFT, payload);

    const sockets = await this.server.in(room).fetchSockets();
    for (const s of sockets) {
      if ((s.data as AuthData)?.userId === payload.userId) {
        // Not awaited: a RemoteSocket's leave() returns void, unlike a local Socket's promise —
        // the adapter dispatches it to whichever node owns the socket.
        s.leave(room);
      }
    }
    // Presence still counts the departed socket until it has left, so refresh after.
    await this.presence.broadcast(this.server, payload.groupId);
  }

  /** Ownership moved — push both ids so clients can flip the two roles in place. */
  @OnEvent(OWNER_CHANGED)
  broadcastOwnerChanged(payload: OwnerChangedPayload): void {
    this.server
      .to(roomFor(payload.groupId))
      .emit(SERVER_EVENTS.OWNER_CHANGED, payload);
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
