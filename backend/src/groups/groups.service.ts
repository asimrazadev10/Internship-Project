import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Group, GroupMember, MemberRole, Prisma } from '@prisma/client';

import { NOT_A_MEMBER_MESSAGE } from '../common/error-messages';
import { PrismaService } from '../prisma/prisma.service';
import { isUuid } from '../common/utils/uuid';
import { GROUP_MEMBER_SELECT } from './group.constants';
import {
  MEMBER_JOINED,
  MemberJoinedPayload,
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
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Create a group and its owner membership ATOMICALLY.
   *
   * These two writes must both succeed or both fail: a group with no OWNER row would be a group
   * nobody can administer, and an orphan membership makes no sense. $transaction gives
   * all-or-nothing — if the second insert fails, the first is rolled back.
   */
  create(userId: string, name: string): Promise<Group> {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: { name, createdBy: userId },
      });

      await tx.groupMember.create({
        data: { groupId: group.id, userId, role: MemberRole.OWNER },
      });

      return group;
    });
  }

  /**
   * Groups the caller belongs to, newest first. Not cursor-paginated: a user is a member of a
   * small, bounded number of groups, unlike messages which are unbounded. Each carries member
   * and message counts, which the list UI needs without a second round-trip.
   */
  findMyGroups(userId: string) {
    return this.prisma.group.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: true, messages: true } },
      },
    });
  }

  /**
   * One group's detail with its member list. Only reached after GroupMemberGuard has confirmed
   * the caller is a member, so a missing group here would be a race (deleted meanwhile) — hence
   * the NotFound guard rather than trusting it always exists.
   */
  async findOne(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          orderBy: { joinedAt: 'asc' },
          select: GROUP_MEMBER_SELECT,
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }

  /**
   * Open join: the caller adds themselves as a MEMBER. Anyone holding the group's (unguessable)
   * id may join — the id acts as a weak capability token, a decision documented in the schema
   * design and README.
   */
  async join(userId: string, groupId: string): Promise<Group> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    try {
      // Select the created member in the SAME shape as one members[] item from findOne, so the
      // event payload can be appended straight into the frontend's cached group detail.
      const member = await this.prisma.groupMember.create({
        data: { groupId, userId, role: MemberRole.MEMBER },
        select: GROUP_MEMBER_SELECT,
      });

      // Persist-then-broadcast, same pattern as messages: the row exists before anyone is told.
      // Emitting here (not in the controller) means every join path fans out through one place;
      // the ChatGateway's @OnEvent turns this into a `member_joined` broadcast to the group's room.
      this.events.emit(MEMBER_JOINED, {
        groupId,
        member,
      } satisfies MemberJoinedPayload);
    } catch (error) {
      // @@unique([groupId, userId]) → P2002 when already a member. Translate the raw constraint
      // error into a clear, intent-revealing message. (No event is emitted on this path — a
      // duplicate join is not a new membership.)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You are already a member of this group');
      }
      throw error;
    }

    return group;
  }

  /**
   * The single membership rule, shared by HTTP (GroupMemberGuard) and WS (ChatGateway).
   * Same response for a missing group and a non-member — doesn't leak which groups exist.
   *
   * Returns the membership row rather than void so the HTTP guard can stash it on the request for
   * handlers that need the caller's role, without issuing a second identical query. Callers that
   * only need the assertion (ChatGateway) simply ignore the return.
   */
  async assertMember(userId: string, groupId: string): Promise<GroupMember> {
    if (!isUuid(groupId)) {
      throw new ForbiddenException(NOT_A_MEMBER_MESSAGE);
    }
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException(NOT_A_MEMBER_MESSAGE);
    }
    return membership;
  }

  /**
   * Read receipt: stamp the caller's membership with "read up to now" and broadcast it. Membership
   * is already proven by GroupMemberGuard, so the composite key is guaranteed to exist.
   */
  async markRead(userId: string, groupId: string): Promise<{ lastReadAt: Date }> {
    const lastReadAt = new Date();
    await this.prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: { lastReadAt },
    });
    this.events.emit(READ_MARKED, {
      groupId,
      userId,
      lastReadAt,
    } satisfies ReadMarkedPayload);
    return { lastReadAt };
  }
}
