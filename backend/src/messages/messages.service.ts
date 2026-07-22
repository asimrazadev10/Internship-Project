import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessageType } from '@prisma/client';

import { PaginationMeta } from '../common/http/api-response';
import { decodeCursor, encodeCursor } from '../common/utils/cursor';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_CREATED, MessageCreatedPayload } from './message-events';

/**
 * Message reads and writes. Membership authorization is enforced by GroupMemberGuard at the
 * controller, so this service assumes the caller is allowed to touch this group.
 */

// Shape returned to clients: never `include: { sender: true }`, which would leak the sender's
// password hash. Sender is null for SYSTEM / AI_SUMMARY messages.
const MESSAGE_SELECT = {
  id: true,
  groupId: true,
  content: true,
  type: true,
  createdAt: true,
  senderId: true,
  sender: { select: { id: true, name: true } },
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(groupId: string, senderId: string, content: string) {
    const message = await this.prisma.message.create({
      data: { groupId, senderId, content, type: MessageType.USER },
      select: MESSAGE_SELECT,
    });
    // Persist-then-broadcast: the row exists before anyone is told about it.
    this.events.emit(MESSAGE_CREATED, { message } satisfies MessageCreatedPayload);
    return message;
  }

  /**
   * Cursor-paginated history, newest first.
   *
   * The keyset predicate is the row-value comparison (createdAt, id) < (cursor.createdAt,
   * cursor.id), written as the equivalent OR form because Prisma has no tuple-comparison
   * operator. It resolves entirely within @@index([groupId, createdAt, id]):
   *   - createdAt strictly older, OR
   *   - same createdAt but a smaller id (the tiebreaker for messages in the same millisecond).
   *
   * This is O(log n) at any depth — unlike OFFSET, which scans and discards, and unlike a
   * createdAt-only cursor, which skips or repeats rows that share a timestamp.
   *
   * One extra row is fetched (take: limit + 1) purely to learn whether a further page exists,
   * without a second COUNT query.
   */
  async findPage(
    groupId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ data: unknown[]; meta: PaginationMeta }> {
    const decoded = cursor ? decodeCursor(cursor) : null;

    const rows = await this.prisma.message.findMany({
      where: {
        groupId,
        ...(decoded
          ? {
              OR: [
                { createdAt: { lt: decoded.createdAt } },
                { createdAt: decoded.createdAt, id: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: MESSAGE_SELECT,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    const nextCursor =
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    return { data: page, meta: { limit, nextCursor, hasMore } };
  }
}
