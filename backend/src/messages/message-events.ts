import { MessageType } from '@prisma/client';

/** Emitted after a message row is persisted. Any transport (WS, future channels) listens. */
export const MESSAGE_CREATED = 'message.created';

/** The message shape selected by MessagesService (no password hash; sender null for system/AI). */
export interface BroadcastMessage {
  id: string;
  groupId: string;
  content: string;
  type: MessageType;
  createdAt: Date;
  senderId: string | null;
  sender: { id: string; name: string } | null;
  reactions: { emoji: string; userId: string }[];
}

export interface MessageCreatedPayload {
  message: BroadcastMessage;
}
