import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessageType } from '@prisma/client';

import { PaginationMeta } from '../common/http/api-response';
import { decodeCursor, encodeCursor } from '../common/utils/cursor';
import { PrismaService } from '../prisma/prisma.service';
import { SEARCH_RESULT_LIMIT } from './message.constants';
import { MESSAGE_SELECT } from './message.select';
import {
  MESSAGE_CREATED,
  MESSAGE_UPDATED,
  MessageCreatedPayload,
  MessageUpdatedPayload,
} from './message-events';

/**
 * Message reads and writes for the INTERACTIVE path — everything a connected user does.
 * Membership authorization is enforced by GroupMemberGuard at the controller, so this service
 * assumes the caller is allowed to touch this group.
 *
 * The AI summary pipeline's queries live in SummaryMessagesService instead: they are called only
 * from the standalone worker, and keeping them here forced that worker to depend on EventEmitter2
 * it never used. Every write in THIS class emits; nothing in the other one does.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(groupId: string, senderId: string, content: string) {
    return this.persistAndEmit({
      groupId,
      senderId,
      content,
      type: MessageType.USER,
    });
  }

  /**
   * Create a message that carries an uploaded file. The bytes are already in object storage; this
   * persists the URL + metadata and broadcasts exactly like a text message, so attachments stream
   * live and appear in history through the same path.
   */
  async createWithAttachment(
    groupId: string,
    senderId: string,
    content: string,
    attachment: { url: string; name: string; mime: string },
  ) {
    return this.persistAndEmit({
      groupId,
      senderId,
      content,
      type: MessageType.USER,
      attachmentUrl: attachment.url,
      attachmentName: attachment.name,
      attachmentMime: attachment.mime,
    });
  }

  /** Edit your own USER message. Broadcasts message.updated so clients replace it in place. */
  async edit(
    groupId: string,
    messageId: string,
    userId: string,
    content: string,
  ) {
    const existing = await this.assertOwnUserMessage(groupId, messageId, userId);
    if (existing.deletedAt) {
      throw new ForbiddenException('This message has been deleted');
    }
    const message = await this.prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      select: MESSAGE_SELECT,
    });
    this.events.emit(MESSAGE_UPDATED, { message } satisfies MessageUpdatedPayload);
    return message;
  }

  /** Soft-delete your own USER message: tombstone it (blank the text) and broadcast the update. */
  async softDelete(groupId: string, messageId: string, userId: string) {
    await this.assertOwnUserMessage(groupId, messageId, userId);
    const message = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: '' },
      select: MESSAGE_SELECT,
    });
    this.events.emit(MESSAGE_UPDATED, { message } satisfies MessageUpdatedPayload);
    return message;
  }

  /** The message must exist in this group AND be a USER message the caller sent. */
  private async assertOwnUserMessage(
    groupId: string,
    messageId: string,
    userId: string,
  ) {
    const existing = await this.prisma.message.findFirst({
      where: { id: messageId, groupId },
      select: { senderId: true, type: true, deletedAt: true },
    });
    if (!existing) throw new NotFoundException('Message not found');
    if (existing.senderId !== userId || existing.type !== MessageType.USER) {
      throw new ForbiddenException('You can only change your own messages');
    }
    return existing;
  }

  /** Single write+emit point so USER and AI_SUMMARY messages both broadcast identically. */
  private async persistAndEmit(data: {
    groupId: string;
    senderId: string | null;
    content: string;
    type: MessageType;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentMime?: string;
  }) {
    const message = await this.prisma.message.create({
      data,
      select: MESSAGE_SELECT,
    });
    // Persist-then-broadcast: the row exists before anyone is told about it.
    this.events.emit(MESSAGE_CREATED, { message } satisfies MessageCreatedPayload);
    return message;
  }

  /**
   * Search a group's USER messages by content (case-insensitive substring), newest first, capped.
   * Deleted messages are excluded. A substring match keeps it simple and dependency-free; a Postgres
   * full-text (tsvector + GIN) index would be the next step for large histories.
   */
  search(groupId: string, q: string) {
    return this.prisma.message.findMany({
      where: {
        groupId,
        type: MessageType.USER,
        deletedAt: null,
        content: { contains: q, mode: 'insensitive' },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: SEARCH_RESULT_LIMIT,
      select: MESSAGE_SELECT,
    });
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
