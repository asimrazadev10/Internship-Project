/**
 * The Socket.IO wire contract: room naming plus every event name that crosses the socket.
 *
 * These strings are a CROSS-PROCESS contract, not an implementation detail. Three consumers must
 * agree on them and no compiler checks that they do:
 *   1. ChatGateway (this process)  — @SubscribeMessage handlers and server.emit
 *   2. NotificationPublisher       — runs in a standalone worker with NO Socket.IO server; it
 *                                    publishes onto the same Redis channels the main app's
 *                                    redis-adapter subscribes to, so its event name must match
 *   3. frontend/src/lib/socket/socket-events.ts — the browser half, a hand-kept mirror
 *
 * A typo in any of them fails SILENTLY. The emit succeeds, no handler is registered, nothing
 * throws: an AI summary published to `new_mesage` is simply never delivered, and the job still
 * reports success. Naming them here makes a rename a compile error inside this package and a
 * one-file diff in the mirror, instead of a grep across two codebases.
 *
 * Note the project already accepts this argument for its IN-PROCESS EventEmitter2 names
 * (group-events.ts, message-events.ts). These are the ones that actually
 * cross a process boundary.
 */

/** Room-name prefix. One Socket.IO room per group. */
export const ROOM_PREFIX = 'group:';

/** Socket.IO room name for a group's chat: `group:<groupId>`. */
export const roomFor = (groupId: string): string => `${ROOM_PREFIX}${groupId}`;

/**
 * Inverse of `roomFor`. Returns null for anything that is not a group room — every socket is also
 * in a private room named after its own id, so callers iterating `socket.rooms` must filter.
 */
export const groupIdFromRoom = (room: string): string | null =>
  room.startsWith(ROOM_PREFIX) ? room.slice(ROOM_PREFIX.length) : null;

/** Client → server. Each one has a matching @SubscribeMessage handler on ChatGateway. */
export const CLIENT_EVENTS = {
  JOIN_GROUP: 'join_group',
  LEAVE_GROUP: 'leave_group',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  SEND_MESSAGE: 'send_message',
} as const;

/** Server → client. */
export const SERVER_EVENTS = {
  NEW_MESSAGE: 'new_message',
  MESSAGE_UPDATED: 'message_updated',
  MEMBER_JOINED: 'member_joined',
  REACTION_UPDATED: 'reaction_updated',
  READ_RECEIPT: 'read_receipt',
  USER_TYPING: 'user_typing',
  PRESENCE: 'presence',
} as const;
