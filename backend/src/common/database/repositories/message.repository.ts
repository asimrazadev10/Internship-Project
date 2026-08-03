import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession, FilterQuery } from 'mongoose';
import { BaseRepository, Cursor, PaginationResult } from './base.repository';
import {
  Message,
  MessageDocument,
  MessageType,
} from '../../../modules/messages/schemas/message.schema';
import { MongoSessionService } from '../mongo-session.service';

@Injectable()
export class MessageRepository extends BaseRepository<MessageDocument> {
  constructor(
    @InjectModel(Message.name) model: Model<MessageDocument>,
    sessionService: MongoSessionService,
  ) {
    super(model, sessionService);
  }

  async findById(
    messageId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<MessageDocument | null> {
    return this.model
      .findById(messageId)
      .populate('sender', 'name')
      .session(session ?? null)
      .exec();
  }

  async findForSummary(
    groupId: Types.ObjectId,
    since: Date,
    session?: ClientSession,
  ): Promise<MessageDocument[]> {
    return this.model
      .find({
        groupId,
        type: MessageType.USER,
        createdAt: { $gte: since },
        deletedAt: null,
      })
      .populate('sender', 'name')
      .select('content createdAt sender')
      .sort({ createdAt: 1 })
      .session(session ?? null)
      .exec();
  }

  async hasSummarySince(
    groupId: Types.ObjectId,
    since: Date,
    session?: ClientSession,
  ): Promise<boolean> {
    const count = await this.model
      .countDocuments({
        groupId,
        type: MessageType.AI_SUMMARY,
        createdAt: { $gte: since },
      })
      .session(session ?? null)
      .exec();
    return count > 0;
  }

  async persistAiSummary(
    groupId: Types.ObjectId,
    content: string,
    session?: ClientSession,
  ): Promise<MessageDocument> {
    return this.create(
      {
        groupId,
        senderId: undefined,
        content,
        type: MessageType.AI_SUMMARY,
      },
      session,
    );
  }

  async findPage(
    groupId: Types.ObjectId,
    limit: number,
    cursor?: Cursor,
    session?: ClientSession,
  ): Promise<PaginationResult<MessageDocument>> {
    const filter: FilterQuery<MessageDocument> = { groupId };
    if (cursor) {
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    return this.findWithPagination(
      filter,
      limit,
      cursor,
      { createdAt: -1, _id: -1 },
      session,
    );
  }

  async search(
    groupId: Types.ObjectId,
    query: string,
    limit: number,
    session?: ClientSession,
  ): Promise<MessageDocument[]> {
    return this.model
      .find({
        groupId,
        type: MessageType.USER,
        deletedAt: null,
        content: { $regex: query, $options: 'i' },
      })
      .populate('sender', 'name')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .session(session ?? null)
      .exec();
  }

  async createMessage(
    data: {
      groupId: Types.ObjectId;
      senderId: Types.ObjectId | null;
      content: string;
      type: MessageType;
      attachmentUrl?: string;
      attachmentName?: string;
      attachmentMime?: string;
    },
    session?: ClientSession,
  ): Promise<MessageDocument> {
    return this.create(
      {
        ...data,
        senderId: data.senderId ?? undefined,
      },
      session,
    );
  }

  async updateMessage(
    messageId: Types.ObjectId,
    content: string,
    session?: ClientSession,
  ): Promise<MessageDocument | null> {
    return this.model
      .findByIdAndUpdate(
        messageId,
        { content, editedAt: new Date() },
        { new: true },
      )
      .populate('sender', 'name')
      .session(session ?? null)
      .exec();
  }

  async softDeleteMessage(
    messageId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<MessageDocument | null> {
    return this.model
      .findByIdAndUpdate(
        messageId,
        { deletedAt: new Date(), content: '' },
        { new: true },
      )
      .populate('sender', 'name')
      .session(session ?? null)
      .exec();
  }

  async assertOwnUserMessage(
    groupId: Types.ObjectId,
    messageId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<MessageDocument | null> {
    return this.model
      .findOne({ _id: messageId, groupId })
      .select('senderId type deletedAt')
      .session(session ?? null)
      .exec();
  }
}
