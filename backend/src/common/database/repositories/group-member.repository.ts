import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { BaseRepository } from './base.repository';
import {
  GroupMember,
  GroupMemberDocument,
  MemberRole,
} from '../../../modules/groups/schemas/group-member.schema';
import { MongoSessionService } from '../mongo-session.service';

@Injectable()
export class GroupMemberRepository extends BaseRepository<GroupMemberDocument> {
  constructor(
    @InjectModel(GroupMember.name) model: Model<GroupMemberDocument>,
    sessionService: MongoSessionService,
  ) {
    super(model, sessionService);
  }

  async findByGroupAndUser(
    groupId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<GroupMemberDocument | null> {
    return this.model
      .findOne({ groupId, userId })
      .session(session ?? null)
      .exec();
  }

  async findMembersByGroup(
    groupId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<GroupMemberDocument[]> {
    return this.model
      .find({ groupId })
      .populate('user', 'name email')
      .sort({ joinedAt: 1 })
      .session(session ?? null)
      .exec();
  }

  async findOwner(
    groupId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<GroupMemberDocument | null> {
    return this.model
      .findOne({ groupId, role: MemberRole.OWNER })
      .session(session ?? null)
      .exec();
  }

  async findSuccessor(
    groupId: Types.ObjectId,
    excludeUserId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<GroupMemberDocument | null> {
    return this.model
      .findOne({ groupId, userId: { $ne: excludeUserId } })
      .sort({ joinedAt: 1, _id: 1 })
      .session(session ?? null)
      .exec();
  }

  async createMembership(
    groupId: Types.ObjectId,
    userId: Types.ObjectId,
    role: MemberRole = MemberRole.MEMBER,
    session?: ClientSession,
  ): Promise<GroupMemberDocument> {
    return this.create({ groupId, userId, role }, session);
  }

  async updateRole(
    membershipId: Types.ObjectId,
    role: MemberRole,
    session?: ClientSession,
  ): Promise<GroupMemberDocument | null> {
    return this.model
      .findByIdAndUpdate(membershipId, { role }, { new: true })
      .session(session ?? null)
      .exec();
  }

  async deleteMembership(
    membershipId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<boolean> {
    return this.deleteOne({ _id: membershipId }, session);
  }

  async updateLastRead(
    groupId: Types.ObjectId,
    userId: Types.ObjectId,
    lastReadAt: Date,
    session?: ClientSession,
  ): Promise<GroupMemberDocument | null> {
    return this.model
      .findOneAndUpdate({ groupId, userId }, { lastReadAt }, { new: true })
      .session(session ?? null)
      .exec();
  }
}
