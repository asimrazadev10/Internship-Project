/**
 * HOW THIS FILE WORKS
 *   1. create() — insert the group AND its OWNER membership in one transaction.
 *   2. findMyGroups() — the caller's groups with member/message counts, newest first.
 *   3. findOne() — one group with its ordered member list.
 *   4. join() — add the caller as a MEMBER and emit MEMBER_JOINED.
 *   5. assertMember() — THE membership rule, shared by the HTTP guard and the socket gateway.
 *   6. markRead() — stamp lastReadAt and emit READ_MARKED.
 *
 * The authorization rule lives in step 5; GroupMemberGuard and ChatGateway both call it, so HTTP
 * and WebSocket can never diverge on who may read a group.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';

import { NOT_A_MEMBER_MESSAGE } from '../common/error-messages';
import { GroupRepository } from '../common/database/repositories/group.repository';
import { GroupMemberRepository } from '../common/database/repositories/group-member.repository';
import { MemberRole } from '../modules/groups/schemas/group-member.schema';
import { GroupMemberDocument } from '../modules/groups/schemas/group-member.schema';
import { MongoSessionService } from '../common/database/mongo-session.service';
import { isObjectId } from '../common/utils/uuid';
import {
  MEMBER_JOINED,
  MemberJoinedPayload,
  MEMBER_LEFT,
  MemberLeftPayload,
  OWNER_CHANGED,
  OwnerChangedPayload,
  READ_MARKED,
  ReadMarkedPayload,
} from './group-events';

/**
 * Group persistence and membership writes. The membership authorization rule lives in
 * GroupMemberGuard; this service is the data layer beneath it.
 */
@Injectable()
export class GroupsService {
  constructor(
    private readonly groups: GroupRepository,
    private readonly members: GroupMemberRepository,
    private readonly session: MongoSessionService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Create a group and its owner membership ATOMICALLY.
   *
   * These two writes must both succeed or both fail: a group with no OWNER row would be a group
   * nobody can administer, and an orphan membership makes no sense. Transaction gives
   * all-or-nothing — if the second insert fails, the first is rolled back.
   */
  async create(userId: string, name: string): Promise<any> {
    const userObjectId = new Types.ObjectId(userId);
    return this.session.withTransaction(async (tx) => {
      const group = await this.groups.create(
        { name, createdBy: userObjectId },
        tx,
      );

      await this.members.createMembership(
        group._id,
        userObjectId,
        MemberRole.OWNER,
        tx,
      );

      // Plain snapshot, not the live document: the global ClassSerializerInterceptor walks any
      // object it is handed, and a Mongoose Document breaks it.
      const groupPlain = group.toObject({ virtuals: true }) as Record<
        string,
        unknown
      >;
      return groupPlain;
    });
  }

  /**
   * Groups the caller belongs to, newest first. Not cursor-paginated: a user is a member of a
   * small, bounded number of groups, unlike messages which are unbounded. Each carries member
   * and message counts, which the list UI needs without a second round-trip.
   */
  findMyGroups(userId: string) {
    return this.groups.findMyGroups(new Types.ObjectId(userId));
  }

  /**
   * One group's detail with its member list. Only reached after GroupMemberGuard has confirmed
   * the caller is a member, so a missing group here would be a race (deleted meanwhile) — hence
   * the NotFound guard rather than trusting it always exists.
   */
  async findOne(groupId: string) {
    const groupObjectId = new Types.ObjectId(groupId);
    const group = await this.groups.findById(groupObjectId);

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Compose the detail from a plain group snapshot plus its member rows (from the groupmembers
    // collection - the stored `Group.members` array is never maintained). Members are plain
    // objects so the ClassSerializerInterceptor never sees a Mongoose document.
    interface PlainGroupMember {
      _id: Types.ObjectId;
      groupId: Types.ObjectId;
      userId: Types.ObjectId;
      role: string;
      joinedAt: Date;
      lastReadAt: Date | null;
      user?: { _id: Types.ObjectId; name: string; email: string } | null;
    }
    const groupPlain = group.toObject({ virtuals: true }) as Record<
      string,
      unknown
    >;
    const rows = await this.members.findMembersByGroup(groupObjectId);
    groupPlain.members = rows.map((row: GroupMemberDocument) => {
      const m = row.toObject({ virtuals: true }) as PlainGroupMember;
      const memberUser = m.user ?? null;
      return {
        id: String(m._id),
        groupId: String(m.groupId),
        userId: String(m.userId),
        role: m.role,
        joinedAt: m.joinedAt,
        lastReadAt: m.lastReadAt ?? null,
        user: memberUser
          ? {
              id: String(memberUser._id),
              name: memberUser.name,
              email: memberUser.email,
            }
          : null,
      };
    });

    return groupPlain;
  }

  /**
   * Open join: the caller adds themselves as a MEMBER. Anyone holding the group's (unguessable)
   * id may join — the id acts as a weak capability token, a decision documented in the schema
   * design and README.
   */
  async join(
    userId: string,
    groupId: string,
  ): Promise<Record<string, unknown>> {
    const userObjectId = new Types.ObjectId(userId);
    const groupObjectId = new Types.ObjectId(groupId);

    const group = await this.groups.findById(groupObjectId);
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    try {
      const member = await this.members.createMembership(
        groupObjectId,
        userObjectId,
        MemberRole.MEMBER,
      );

      await member.populate('user', 'name email');
      const memberUser = member.user;

      this.events.emit(MEMBER_JOINED, {
        groupId,
        member: {
          id: member._id.toString(),
          groupId: member.groupId.toString(),
          userId: member.userId.toString(),
          role: member.role,
          joinedAt: member.joinedAt,
          lastReadAt: member.lastReadAt ?? null,
          user: memberUser
            ? {
                id: memberUser._id.toString(),
                name: memberUser.name,
                email: memberUser.email,
              }
            : { id: member.userId.toString(), name: '', email: '' },
        } satisfies MemberJoinedPayload['member'],
      } satisfies MemberJoinedPayload);
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) {
        throw new ConflictException('You are already a member of this group');
      }
      throw error;
    }

    return group.toObject({ virtuals: true }) as Record<string, unknown>;
  }

  /**
   * Leave a group. The caller's membership always goes; what else happens depends on their role.
   *
   * An OWNER cannot simply vanish — a group with no OWNER is one nobody can administer and
   * nothing can repair. So the owner's departure either promotes the longest-standing remaining
   * member, or, if there is no one left, deletes the group outright (Message and GroupMember
   * both cascade from Group).
   *
   * The whole thing is one transaction: a crash between "promote successor" and "delete owner"
   * would leave exactly the ownerless group this method exists to prevent.
   */
  async leave(
    userId: string,
    groupId: string,
  ): Promise<{ left: true; groupDeleted: boolean; newOwnerId: string | null }> {
    const userObjectId = new Types.ObjectId(userId);
    const groupObjectId = new Types.ObjectId(groupId);

    const outcome = await this.session.withTransaction(async (tx) => {
      const me = await this.members.findByGroupAndUser(
        groupObjectId,
        userObjectId,
        tx,
      );
      if (!me) {
        throw new ForbiddenException(NOT_A_MEMBER_MESSAGE);
      }

      if (me.role !== MemberRole.OWNER) {
        await this.members.deleteMembership(me._id, tx);
        return { groupDeleted: false, newOwnerId: null };
      }

      const successor = await this.members.findSuccessor(
        groupObjectId,
        userObjectId,
        tx,
      );

      if (!successor) {
        await this.groups.deleteOne({ _id: groupObjectId }, tx);
        await this.members.deleteMany({ groupId: groupObjectId }, tx);
        return { groupDeleted: true, newOwnerId: null };
      }

      await this.members.updateRole(successor._id, MemberRole.OWNER, tx);
      await this.members.deleteMembership(me._id, tx);
      return { groupDeleted: false, newOwnerId: successor.userId.toString() };
    });

    if (outcome.newOwnerId) {
      this.events.emit(OWNER_CHANGED, {
        groupId,
        previousOwnerId: userId,
        newOwnerId: outcome.newOwnerId,
      } satisfies OwnerChangedPayload);
    }
    if (!outcome.groupDeleted) {
      this.events.emit(MEMBER_LEFT, {
        groupId,
        userId,
      } satisfies MemberLeftPayload);
    }

    return { left: true, ...outcome };
  }

  /**
   * Hand ownership to another member. Both parties stay in the group; only their roles swap.
   *
   * Group.createdBy is deliberately NOT touched. It records who created the group, and it is half
   * of @@unique([createdBy, name]) — reassigning it could collide with a group the new owner
   * already has by that name, failing the transfer with an error about column names.
   *
   * The caller's OWNER role is verified INSIDE the transaction. A guard would run before this
   * opened, so two concurrent transfers could both pass it and leave the group with two owners.
   */
  async transferOwnership(
    callerId: string,
    groupId: string,
    targetUserId: string,
  ): Promise<{ previousOwnerId: string; newOwnerId: string }> {
    if (callerId === targetUserId) {
      throw new BadRequestException('You already own this group');
    }

    const callerObjectId = new Types.ObjectId(callerId);
    const groupObjectId = new Types.ObjectId(groupId);
    const targetObjectId = new Types.ObjectId(targetUserId);

    await this.session.withTransaction(async (tx) => {
      const caller = await this.members.findByGroupAndUser(
        groupObjectId,
        callerObjectId,
        tx,
      );
      if (!caller || caller.role !== MemberRole.OWNER) {
        throw new ForbiddenException(
          'Only the group owner can transfer ownership',
        );
      }

      const target = await this.members.findByGroupAndUser(
        groupObjectId,
        targetObjectId,
        tx,
      );
      if (!target) {
        throw new NotFoundException('That user is not a member of this group');
      }

      await this.members.updateRole(target._id, MemberRole.OWNER, tx);
      await this.members.updateRole(caller._id, MemberRole.MEMBER, tx);
    });

    this.events.emit(OWNER_CHANGED, {
      groupId,
      previousOwnerId: callerId,
      newOwnerId: targetUserId,
    } satisfies OwnerChangedPayload);

    return { previousOwnerId: callerId, newOwnerId: targetUserId };
  }

  /**
   * The single membership rule, shared by HTTP (GroupMemberGuard) and WS (ChatGateway).
   * Same response for a missing group and a non-member — doesn't leak which groups exist.
   *
   * Returns the membership row rather than void so the HTTP guard can stash it on the request for
   * handlers that need the caller's role, without issuing a second identical query. Callers that
   * only need the assertion (ChatGateway) simply ignore the return.
   */
  async assertMember(
    userId: string,
    groupId: string,
  ): Promise<GroupMemberDocument> {
    if (!isObjectId(groupId)) {
      throw new ForbiddenException(NOT_A_MEMBER_MESSAGE);
    }
    const membership = await this.members.findByGroupAndUser(
      new Types.ObjectId(groupId),
      new Types.ObjectId(userId),
    );
    if (!membership) {
      throw new ForbiddenException(NOT_A_MEMBER_MESSAGE);
    }
    return membership;
  }

  /**
   * Read receipt: stamp the caller's membership with "read up to now" and broadcast it. Membership
   * is already proven by GroupMemberGuard, so the composite key is guaranteed to exist.
   */
  async markRead(
    userId: string,
    groupId: string,
  ): Promise<{ lastReadAt: Date }> {
    const lastReadAt = new Date();
    await this.members.updateLastRead(
      new Types.ObjectId(groupId),
      new Types.ObjectId(userId),
      lastReadAt,
    );
    this.events.emit(READ_MARKED, {
      groupId,
      userId,
      lastReadAt,
    } satisfies ReadMarkedPayload);
    return { lastReadAt };
  }
}
