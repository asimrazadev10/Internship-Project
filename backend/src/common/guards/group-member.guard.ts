import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GroupMember } from '@prisma/client';
import { Request } from 'express';

import { AuthUser } from '../decorators/current-user.decorator';
import { NOT_A_MEMBER_MESSAGE } from '../error-messages';
import { PrismaService } from '../../prisma/prisma.service';
import { isUuid } from '../utils/uuid';

/**
 * Enforces CLAUDE.md's rule that a user may only read or post in a group they belong to —
 * "with a Guard, not ad-hoc checks". Centralising it here means the rule is written once and
 * cannot be forgotten on a new group-scoped endpoint.
 *
 * Runs AFTER the global JwtAuthGuard (global guards execute before route guards), so req.user
 * is already populated. The membership lookup is a single index hit: the exact
 * @@unique([groupId, userId]) constraint the schema declares.
 *
 * A malformed id is a 400 (bad request). A valid id with no membership is a 403 — deliberately
 * the same response whether the group does not exist or the caller simply is not a member, so
 * the endpoint does not leak which groups exist to non-members. Group ids are unguessable v7
 * UUIDs, so this is a low-cost, safe default.
 */
@Injectable()
export class GroupMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: AuthUser; groupMembership?: GroupMember }
      >();

    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const groupId = request.params.id;
    if (!isUuid(groupId)) {
      throw new ForbiddenException(NOT_A_MEMBER_MESSAGE);
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.userId } },
    });

    if (!membership) {
      throw new ForbiddenException(NOT_A_MEMBER_MESSAGE);
    }

    // Surface the loaded membership so handlers needing the caller's role don't re-query.
    request.groupMembership = membership;
    return true;
  }
}
