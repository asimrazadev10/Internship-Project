import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { BaseRepository } from './base.repository';
import {
  Reaction,
  ReactionDocument,
} from '../../../modules/messages/schemas/reaction.schema';
import { MongoSessionService } from '../mongo-session.service';

@Injectable()
export class ReactionRepository extends BaseRepository<ReactionDocument> {
  constructor(
    @InjectModel(Reaction.name) model: Model<ReactionDocument>,
    sessionService: MongoSessionService,
  ) {
    super(model, sessionService);
  }

  async findByMessageAndUser(
    messageId: Types.ObjectId,
    userId: Types.ObjectId,
    emoji: string,
    session?: ClientSession,
  ): Promise<ReactionDocument | null> {
    return this.model
      .findOne({ messageId, userId, emoji })
      .session(session ?? null)
      .exec();
  }

  async findByMessage(
    messageId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<ReactionDocument[]> {
    return this.model
      .find({ messageId })
      .populate('user', 'name')
      .session(session ?? null)
      .exec();
  }

  async createReaction(
    data: {
      messageId: Types.ObjectId;
      userId: Types.ObjectId;
      emoji: string;
    },
    session?: ClientSession,
  ): Promise<ReactionDocument> {
    return this.create(data, session);
  }

  async deleteReaction(
    messageId: Types.ObjectId,
    userId: Types.ObjectId,
    emoji: string,
    session?: ClientSession,
  ): Promise<boolean> {
    return this.deleteOne({ messageId, userId, emoji }, session);
  }

  async deleteByMessage(
    messageId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    return this.deleteMany({ messageId }, session);
  }
}
