/**
 * HOW THIS FILE WORKS
 *   1. create() / createWithAttachment() — both funnel into persistAndEmit().
 *   2. edit() / softDelete() — assert ownership first, update, then emit MESSAGE_UPDATED.
 *   3. assertOwnUserMessage() — the shared ownership check behind both of those.
 *   4. persistAndEmit() — the single write-then-emit point for new messages.
 *   5. search() — case-insensitive substring, newest first, hard-capped.
 *   6. findPage() — keyset (cursor) pagination on (createdAt, id).
 *
 * The interactive path only. Every write here emits; nothing in SummaryMessagesService does.
 */
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
    // Step 1. Called by both the REST POST and ChatGateway.sendMessage.
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
    // Same emit path as a plain message, so attachments need no special client handling.
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
    // Step 2. Ownership and type are checked before anything is written.
    const existing = await this.assertOwnUserMessage(
      groupId,
      messageId,
      userId,
    );
    // Editing a tombstone would resurrect text the user deliberately removed.
    if (existing.deletedAt) {
      throw new ForbiddenException('This message has been deleted');
    }
    // editedAt is stamped so the UI can show an "edited" marker.
    const message = await this.prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      select: MESSAGE_SELECT,
    });
    // MESSAGE_UPDATED, not MESSAGE_CREATED, so clients replace rather than append.
    this.events.emit(MESSAGE_UPDATED, {
      message,
    } satisfies MessageUpdatedPayload);
    return message;
  }

  /** Soft-delete your own USER message: tombstone it (blank the text) and broadcast the update. */
  async softDelete(groupId: string, messageId: string, userId: string) {
    await this.assertOwnUserMessage(groupId, messageId, userId);
    // The row survives so reactions and reply threads keep their referent; only the text goes.
    const message = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: '' },
      select: MESSAGE_SELECT,
    });
    // The same event as an edit — to a client, a deletion is just another replacement.
    this.events.emit(MESSAGE_UPDATED, {
      message,
    } satisfies MessageUpdatedPayload);
    return message;
  }

  /** The message must exist in this group AND be a USER message the caller sent. */
  private async assertOwnUserMessage(
    groupId: string,
    messageId: string,
    userId: string,
  ) {
    // Step 3. Both ids in the WHERE, so a message from another group reads as not found.
    const existing = await this.prisma.message.findFirst({
      where: { id: messageId, groupId },
      select: { senderId: true, type: true, deletedAt: true },
    });
    if (!existing) throw new NotFoundException('Message not found');
    // The type check is what stops anyone editing a SYSTEM or AI_SUMMARY message.
    if (existing.senderId !== userId || existing.type !== MessageType.USER) {
      throw new ForbiddenException('You can only change your own messages');
    }
    return existing;
  }

  /** Single write+emit point so USER and AI_SUMMARY messages both broadcast identically. */
  private async persistAndEmit(data: {
    groupId: string;
    // Nullable to allow system-authored rows through the same path.
    senderId: string | null;
    content: string;
    type: MessageType;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentMime?: string;
  }) {
    // Step 4. MESSAGE_SELECT means the emitted payload is already in broadcast shape.
    const message = await this.prisma.message.create({
      data,
      select: MESSAGE_SELECT,
    });
    // Persist-then-broadcast: the row exists before anyone is told about it.
    this.events.emit(MESSAGE_CREATED, {
      message,
    } satisfies MessageCreatedPayload);
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
        // `contains` compiles to ILIKE %q% — no index can serve it, hence the hard cap below.
        content: { contains: q, mode: 'insensitive' },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // Step 5. The only thing between a one-character query and a whole group's history.
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
    // Step 6. An absent cursor means the first page; the spread below then adds no predicate.
    const decoded = cursor ? decodeCursor(cursor) : null;

    const rows = await this.prisma.message.findMany({
      where: {
        groupId,
        ...(decoded
          ? {
              // The two-branch OR is the tuple comparison Prisma cannot express directly.
              OR: [
                { createdAt: { lt: decoded.createdAt } },
                { createdAt: decoded.createdAt, id: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      // Must mirror the cursor's field order, or the keyset predicate stops being sound.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // The +1 row is the has-more probe, and is sliced off before returning.
      take: limit + 1,
      select: MESSAGE_SELECT,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    // The last row of the page becomes the next cursor's position.
    const last = page.at(-1);

    // null rather than a cursor when the history is exhausted, so the client knows to stop.
    const nextCursor =
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    return { data: page, meta: { limit, nextCursor, hasMore } };
  }
}
