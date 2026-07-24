/** Emitted after a message's reactions change, so the gateway can broadcast the new set. */
export const REACTION_CHANGED = 'reaction.changed';

export interface ReactionChangedPayload {
  groupId: string;
  messageId: string;
  reactions: { emoji: string; userId: string }[];
}
