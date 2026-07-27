import { MessageType } from '@prisma/client';

/** Emitted after a message row is persisted. Any transport (WS, future channels) listens. */
export const MESSAGE_CREATED = 'message.created';

/** Emitted after a message is edited or (soft) deleted, so clients replace it in place. */
export const MESSAGE_UPDATED = 'message.updated';

/** The message shape selected by MessagesService (no password hash; sender null for system/AI). */
export interface BroadcastMessage {
  id: string;
  groupId: string;
  content: string;
  type: MessageType;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  senderId: string | null;
  sender: { id: string; name: string } | null;
  reactions: { emoji: string; userId: string }[];
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
}

export interface MessageCreatedPayload {
  message: BroadcastMessage;
}

export interface MessageUpdatedPayload {
  message: BroadcastMessage;
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
  groupId: string;
  messageId: string;
  reactions: { emoji: string; userId: string }[];
}
