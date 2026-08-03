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
import { Types } from 'mongoose';
import { MessageType } from '../modules/messages/schemas/message.schema';

import { PaginationMeta } from '../common/http/api-response';
import { decodeCursor } from '../common/utils/cursor';
import { MessageRepository } from '../common/database/repositories/message.repository';
import { SEARCH_RESULT_LIMIT } from './message.constants';
import {
  MESSAGE_CREATED,
  MESSAGE_UPDATED,
  MessageCreatedPayload,
  MessageUpdatedPayload,
  BroadcastMessage,
  PopulatedMessage,
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
    private readonly messages: MessageRepository,
    private readonly events: EventEmitter2,
  ) {}

  async create(groupId: string, senderId: string, content: string) {
    return this.persistAndEmit({
      groupId: new Types.ObjectId(groupId),
      senderId: new Types.ObjectId(senderId),
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
      groupId: new Types.ObjectId(groupId),
      senderId: new Types.ObjectId(senderId),
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
    const existing = await this.assertOwnUserMessage(
      groupId,
      messageId,
      userId,
    );
    if (existing.deletedAt) {
      throw new ForbiddenException('This message has been deleted');
    }
    const message = await this.messages.updateMessage(
      new Types.ObjectId(messageId),
      content,
    );
    this.events.emit(MESSAGE_UPDATED, {
      message: this.toBroadcastMessage(message),
    } satisfies MessageUpdatedPayload);
    // Plain broadcast shape, never the live document (see persistAndEmit).
    return this.toBroadcastMessage(message);
  }

  /** Soft-delete your own USER message: tombstone it (blank the text) and broadcast the update. */
  async softDelete(groupId: string, messageId: string, userId: string) {
    await this.assertOwnUserMessage(groupId, messageId, userId);
    const message = await this.messages.softDeleteMessage(
      new Types.ObjectId(messageId),
    );
    this.events.emit(MESSAGE_UPDATED, {
      message: this.toBroadcastMessage(message),
    } satisfies MessageUpdatedPayload);
    return this.toBroadcastMessage(message);
  }

  /** The message must exist in this group AND be a USER message the caller sent. */
  private async assertOwnUserMessage(
    groupId: string,
    messageId: string,
    userId: string,
  ) {
    const existing = await this.messages.assertOwnUserMessage(
      new Types.ObjectId(groupId),
      new Types.ObjectId(messageId),
      new Types.ObjectId(userId),
    );
    if (!existing) throw new NotFoundException('Message not found');
    if (
      !existing.senderId?.equals(new Types.ObjectId(userId)) ||
      existing.type !== MessageType.USER
    ) {
      throw new ForbiddenException('You can only change your own messages');
    }
    return existing;
  }

  /** Single write+emit point so USER and AI_SUMMARY messages both broadcast identically. */
  private async persistAndEmit(data: {
    groupId: Types.ObjectId;
    senderId: Types.ObjectId | null;
    content: string;
    type: MessageType;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentMime?: string;
  }) {
    const message = await this.messages.createMessage(data);
    // Populate sender for broadcast, then return the plain broadcast shape.
    const populated = await this.messages.findById(message._id);
    this.events.emit(MESSAGE_CREATED, {
      message: this.toBroadcastMessage(populated),
    } satisfies MessageCreatedPayload);
    return this.toBroadcastMessage(populated);
  }

  /**
   * Search a group's USER messages by content (case-insensitive substring), newest first, capped.
   * Deleted messages are excluded. A substring match keeps it simple and dependency-free; a Postgres
   * full-text (tsvector + GIN) index would be the next step for large histories.
   */
  search(groupId: string, q: string) {
    return this.messages
      .search(new Types.ObjectId(groupId), q, SEARCH_RESULT_LIMIT)
      .then((rows) => rows.map((r) => this.toBroadcastMessage(r)));
  }

  /**
   * Cursor-paginated history, newest first.
   *
   * The keyset predicate is the row-value comparison (createdAt, id) < (cursor.createdAt,
   * cursor.id), written as the equivalent OR form. It resolves entirely within the compound index:
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

    const result = await this.messages.findPage(
      new Types.ObjectId(groupId),
      limit,
      decoded
        ? {
            createdAt: decoded.createdAt,
            id: new Types.ObjectId(decoded.id),
          }
        : undefined,
    );

    return {
      // Map live documents to plain broadcast shapes for the serializer.
      data: result.data.map((r) => this.toBroadcastMessage(r)),
      meta: result.meta,
    };
  }

  private toBroadcastMessage(
    message: PopulatedMessage | null,
  ): BroadcastMessage {
    if (!message) {
      throw new Error('Message not found');
    }
    return {
      id: message._id.toString(),
      groupId: message.groupId.toString(),
      content: message.content,
      type: message.type,
      createdAt: message.createdAt,
      editedAt: message.editedAt ?? null,
      deletedAt: message.deletedAt ?? null,
      senderId: message.senderId?.toString() ?? null,
      sender: message.sender
        ? { id: message.sender._id.toString(), name: message.sender.name }
        : null,
      reactions:
        message.reactions?.map((r) => ({
          emoji: r.emoji,
          userId: r.userId.toString(),
        })) ?? [],
      attachmentUrl: message.attachmentUrl ?? null,
      attachmentName: message.attachmentName ?? null,
      attachmentMime: message.attachmentMime ?? null,
    };
  }
}
