import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { BaseRepository } from './base.repository';
import {
  Group,
  GroupDocument,
} from '../../../modules/groups/schemas/group.schema';
import { MongoSessionService } from '../mongo-session.service';

@Injectable()
export class GroupRepository extends BaseRepository<GroupDocument> {
  constructor(
    @InjectModel(Group.name) model: Model<GroupDocument>,
    sessionService: MongoSessionService,
  ) {
    super(model, sessionService);
  }

  async findMyGroups(
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<any[]> {
    const rows = await this.model
      .aggregate([
        {
          $lookup: {
            from: 'groupmembers',
            localField: '_id',
            foreignField: 'groupId',
            as: 'members',
          },
        },
        {
          $match: {
            'members.userId': userId,
          },
        },
        {
          $lookup: {
            from: 'messages',
            localField: '_id',
            foreignField: 'groupId',
            as: 'messages',
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            createdBy: 1,
            createdAt: 1,
            memberCount: { $size: '$members' },
            messageCount: { $size: '$messages' },
          },
        },
        { $sort: { createdAt: -1 } },
      ])
      .session(session ?? null)
      .exec();

    // The UI expects a `id`/`_count` shape (see frontend GroupSummary), but an aggregation
    // returns raw BSON docs where `_id` stays an ObjectId that the ClassSerializerInterceptor
    // flattens into its own properties. Map each row to the plain shape the client consumes.
    return rows.map((row: Record<string, unknown>) => ({
      id: String(row._id as Types.ObjectId),
      name: row.name as string,
      createdBy: String(row.createdBy as Types.ObjectId),
      createdAt: row.createdAt as Date,
      _count: {
        members: row.memberCount as number,
        messages: row.messageCount as number,
      },
    }));
  }

  async findOneWithMembers(
    groupId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<GroupDocument | null> {
    return this.model
      .findById(groupId)
      .populate({
        path: 'members',
        populate: {
          path: 'user',
          select: 'name email',
        },
        options: { sort: { joinedAt: 1 } },
      })
      .session(session ?? null)
      .exec();
  }

  async findById(
    groupId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<GroupDocument | null> {
    return this.model
      .findById(groupId)
      .session(session ?? null)
      .exec();
  }
}
