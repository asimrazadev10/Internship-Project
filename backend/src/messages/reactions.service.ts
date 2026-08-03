/**
 * HOW THIS FILE WORKS
 *   1. Confirm the message really belongs to the group named in the route.
 *   2. Attempt the DELETE first — its row count IS the "does it exist?" test.
 *   3. If nothing was deleted, insert; a duplicate key error from a concurrent insert is treated as success.
 *   4. Re-read the full reaction set and emit REACTION_CHANGED for the gateway to broadcast.
 *
 * The delete-first ordering is what makes the toggle race-safe; see the comment on step 2.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';

import { MessageRepository } from '../common/database/repositories/message.repository';
import { ReactionRepository } from '../common/database/repositories/reaction.repository';
import { REACTION_CHANGED, ReactionChangedPayload } from './message-events';

/**
 * Message reactions. Membership on the group is already proven by GroupMemberGuard; this service
 * additionally checks the message actually belongs to that group before touching it.
 */
@Injectable()
export class ReactionsService {
  constructor(
    private readonly messages: MessageRepository,
    private readonly reactions: ReactionRepository,
    private readonly events: EventEmitter2,
  ) {}

  /** Toggle a user's emoji on a message (add if absent, remove if present). Returns the new set. */
  async toggle(
    groupId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<{ emoji: string; userId: string }[]> {
    // Step 1. Both ids in the WHERE — without this you could react to another group's message.
    const message = await this.messages.findById(messageId);
    if (!message || !message.groupId.equals(new Types.ObjectId(groupId))) {
      throw new NotFoundException('Message not found');
    }

    // The delete IS the existence test. deleteMany reports how many rows it removed, so "was it
    // there?" and "remove it" are one statement instead of a read followed by a write — which is
    // what made this racy: two concurrent taps of the same emoji both read "absent", both
    // inserted, and the unique constraint turned the loser into an error. The user double-tapped
    // and got an error.
    const removed = await this.reactions.deleteReaction(
      new Types.ObjectId(messageId),
      new Types.ObjectId(userId),
      emoji,
    );

    // Step 3. removed === false means it was absent, so this is an "add".
    if (!removed) {
      try {
        await this.reactions.createReaction({
          messageId: new Types.ObjectId(messageId),
          userId: new Types.ObjectId(userId),
          emoji,
        });
      } catch (error) {
        // Duplicate key error here means a concurrent request added the very same reaction first.
        // That is the state this call was trying to reach, so converge on it rather than failing:
        // toggling is idempotent in intent. Anything else is a real error and still propagates.
        if ((error as { code?: number })?.code !== 11000) {
          throw error;
        }
      }
    }

    // Step 4. The whole set, not a delta, so the client replaces rather than reconciles.
    const reactions = await this.reactions.findByMessage(
      new Types.ObjectId(messageId),
    );
    // Persist-then-broadcast, same pattern as messages: the gateway's @OnEvent fans this out.
    this.events.emit(REACTION_CHANGED, {
      groupId,
      messageId,
      reactions: reactions.map((r) => ({
        emoji: r.emoji,
        userId: r.userId.toString(),
      })),
    } satisfies ReactionChangedPayload);
    return reactions.map((r) => ({
      emoji: r.emoji,
      userId: r.userId.toString(),
    }));
  }
}
