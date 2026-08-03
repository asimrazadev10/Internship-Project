/**
 * HOW THIS FILE WORKS
 *   1. MESSAGE_CREATED / MESSAGE_UPDATED — in-process EventEmitter2 names.
 *   2. BroadcastMessage — the wire shape, matching MESSAGE_SELECT field for field.
 *   3. The two payload interfaces those events carry.
 *   4. REACTION_CHANGED and its payload, kept here for the reason given below.
 *
 * These decouple the writer from the broadcaster: MessagesService emits, ChatGateway listens, and
 * neither imports the other.
 */
import { Types } from 'mongoose';
import { MessageType } from '../modules/messages/schemas/message.schema';

/** Emitted after a message row is persisted. Any transport (WS, future channels) listens. */
// Emitted AFTER the write commits, so a listener can never observe a message that does not exist.
export const MESSAGE_CREATED = 'message.created';

/** Emitted after a message is edited or (soft) deleted, so clients replace it in place. */
export const MESSAGE_UPDATED = 'message.updated';

/** The message shape selected by MessagesService (no password hash; sender null for system/AI). */
// Hand-written rather than derived from MESSAGE_SELECT — the two must be kept in step by eye.
export interface BroadcastMessage {
  id: string;
  groupId: string;
  content: string;
  type: MessageType;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  // Nullable because SYSTEM and AI_SUMMARY messages have no human author.
  senderId: string | null;
  sender: { id: string; name: string } | null;
  reactions: { emoji: string; userId: string }[];
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
}

// Wrapped in an object rather than passing the message bare, so a field can be added later.
export interface MessageCreatedPayload {
  message: BroadcastMessage;
}

export interface MessageUpdatedPayload {
  message: BroadcastMessage;
}

/**
 * The hydrated Message document shape read by the broadcast mappers (populated `sender` and
 * `reactions` virtuals included). Declared so the two `toBroadcastMessage` implementations in
 * MessagesService and SummaryProcessor can map without touching `any`.
 */
export interface PopulatedMessage {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  content: string;
  type: MessageType;
  createdAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
  senderId?: Types.ObjectId | null;
  sender?: { _id: Types.ObjectId; name: string } | null;
  reactions?: { emoji: string; userId: Types.ObjectId }[];
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
}

/** Emitted after a message's reactions change, so the gateway can broadcast the new set. */
export const REACTION_CHANGED = 'reaction.changed';

/**
 * Lives here rather than in its own file: it is the same kind of thing as the two events above —
 * an in-process EventEmitter2 name plus its payload, emitted by the messages module and consumed
 * by ChatGateway. Splitting it out made ChatGateway open this module with four import statements
 * over seven lines. Note `reactions` is the same shape as BroadcastMessage.reactions.
 */
export interface ReactionChangedPayload {
  // groupId is carried explicitly because the gateway needs it to resolve the room.
  groupId: string;
  messageId: string;
  // The full new set, not a delta, so the client can replace rather than reconcile.
  reactions: { emoji: string; userId: string }[];
}
