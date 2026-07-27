import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { REACTION_CHANGED, ReactionChangedPayload } from './message-events';

/**
 * Message reactions. Membership on the group is already proven by GroupMemberGuard; this service
 * additionally checks the message actually belongs to that group before touching it.
 */
@Injectable()
export class ReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** Toggle a user's emoji on a message (add if absent, remove if present). Returns the new set. */
  async toggle(
    groupId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<{ emoji: string; userId: string }[]> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, groupId },
      select: { id: true },
    });
    if (!message) throw new NotFoundException('Message not found');

    // The delete IS the existence test. deleteMany reports how many rows it removed, so "was it
    // there?" and "remove it" are one statement instead of a read followed by a write — which is
    // what made this racy: two concurrent taps of the same emoji both read "absent", both
    // inserted, and the @@unique([messageId, userId, emoji]) constraint turned the loser into an
    // uncaught P2002 → 409. The user double-tapped and got an error.
    const removed = await this.prisma.reaction.deleteMany({
      where: { messageId, userId, emoji },
    });

    if (removed.count === 0) {
      try {
        await this.prisma.reaction.create({
          data: { messageId, userId, emoji },
        });
      } catch (error) {
        // P2002 here means a concurrent request added the very same reaction first. That is the
        // state this call was trying to reach, so converge on it rather than failing: toggling
        // is idempotent in intent. Anything else is a real error and still propagates.
        if (!(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )) {
          throw error;
        }
      }
    }

    const reactions = await this.prisma.reaction.findMany({
      where: { messageId },
      select: { emoji: true, userId: true },
    });
    // Persist-then-broadcast, same pattern as messages: the gateway's @OnEvent fans this out.
    this.events.emit(REACTION_CHANGED, {
      groupId,
      messageId,
      reactions,
    } satisfies ReactionChangedPayload);
    return reactions;
  }
}
