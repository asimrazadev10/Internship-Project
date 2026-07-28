import type { Message } from "@/lib/api/types";

/**
 * The browser half of the Socket.IO wire contract.
 *
 * MIRROR OF backend/src/chat/chat.constants.ts. The two sides are separate npm packages with
 * separate tsconfigs and there is no shared package, so this cannot import from the backend —
 * the keys are kept identical by hand. Change one, change the other.
 *
 * Why this is worth a file: a misspelled `socket.on(...)` compiles and runs, and the handler just
 * never fires. A mismatched `socket.off(...)` is worse — cleanup silently no-ops and the listener
 * leaks on every group switch. An outbound typo is quietest of all: no handler exists, so the ack
 * never arrives and the composer sits in its sending state until the timeout fires.
 */

/** Client → server. */
export const CLIENT_EVENTS = {
  JOIN_GROUP: "join_group",
  LEAVE_GROUP: "leave_group",
  TYPING_START: "typing_start",
  TYPING_STOP: "typing_stop",
  SEND_MESSAGE: "send_message",
} as const;

/** Server → client. */
export const SERVER_EVENTS = {
  NEW_MESSAGE: "new_message",
  MESSAGE_UPDATED: "message_updated",
  MEMBER_JOINED: "member_joined",
  MEMBER_LEFT: "member_left",
  OWNER_CHANGED: "owner_changed",
  REACTION_UPDATED: "reaction_updated",
  READ_RECEIPT: "read_receipt",
  USER_TYPING: "user_typing",
  PRESENCE: "presence",
} as const;

/**
 * The ack ChatGateway.sendMessage actually returns.
 *
 * The composer previously hand-typed this as `{ ok: boolean; error?: string }`, which silently
 * discarded the `message` the gateway sends back on success. Typing it here keeps the shape
 * honest — and note it is NOT the same shape as join_group's ack, which is `{ ok: true }`.
 */
export type SendMessageAck =
  | { ok: true; message: Message }
  | { ok: false; error: string };
