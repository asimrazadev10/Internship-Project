import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../prisma/prisma.service';
import { REACTION_CHANGED, ReactionChangedPayload } from './reaction-events';

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

    const existing = await this.prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.reaction.create({ data: { messageId, userId, emoji } });
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
