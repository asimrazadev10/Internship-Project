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
}

export interface MessageCreatedPayload {
  message: BroadcastMessage;
}

export interface MessageUpdatedPayload {
  message: BroadcastMessage;
}
