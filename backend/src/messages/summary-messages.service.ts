import { Injectable } from '@nestjs/common';
import { MessageType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_SELECT } from './message.select';

/**
 * The message queries the AI summary pipeline needs — and nothing else.
 *
 * Split out of MessagesService because the two serve DISJOINT callers in DIFFERENT PROCESSES:
 * every method here is called only by SummaryProcessor, which runs in the standalone summary
 * worker. That was not a stylistic split; it fixed a real wart. MessagesService depends on
 * EventEmitter2, so importing it into the worker forced summary-worker.module to pull in
 * EventEmitterModule purely to satisfy a dependency the worker never used — with a comment
 * apologising for it.
 *
 * This service depends on PrismaService alone.
 *
 * Note the deliberate asymmetry with MessagesService: `persistAiSummary` writes WITHOUT emitting,
 * while everything in MessagesService emits. Previously those two behaviours sat three lines
 * apart in one file, which is a trap; here the no-emit rule is the whole point of the class and
 * the docblock can say so.
 */
@Injectable()
export class SummaryMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist an AI summary as a message with no human sender, WITHOUT broadcasting.
   *
   * In the distributed pipeline the broadcast is a separate stage (publish-summary) running in
   * another process over the Redis emitter, so this write must not emit the in-process
   * MESSAGE_CREATED event: no gateway lives in the worker to receive it, and emitting would risk
   * double-broadcasting once the publish stage runs.
   */
  persistAiSummary(groupId: string, content: string) {
    return this.prisma.message.create({
      data: { groupId, senderId: null, content, type: MessageType.AI_SUMMARY },
      select: MESSAGE_SELECT,
    });
  }

  /** The window's USER messages (oldest first) that a summary is built from. */
  findForSummary(groupId: string, since: Date) {
    return this.prisma.message.findMany({
      where: {
        groupId,
        type: MessageType.USER,
        createdAt: { gte: since },
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        content: true,
        createdAt: true,
        sender: { select: { name: true } },
      },
    });
  }

  /** Idempotency guard: has an AI_SUMMARY already been posted for this group in the window? */
  async hasSummarySince(groupId: string, since: Date): Promise<boolean> {
    const count = await this.prisma.message.count({
      where: {
        groupId,
        type: MessageType.AI_SUMMARY,
        createdAt: { gte: since },
      },
    });
    return count > 0;
  }
}
