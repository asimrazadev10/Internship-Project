/**
 * HOW THIS FILE WORKS
 *   1. Pull the request, typed so params.id is known to be the group id.
 *   2. Reject if req.user is missing — it should never be, given the global guard runs first.
 *   3. Delegate to GroupsService.assertMember, which throws 403 on a non-member.
 *   4. Stash the loaded membership on the request so handlers need not re-query.
 *
 * The membership rule itself is NOT implemented here — the socket path calls the same method.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GroupMember } from '@prisma/client';
import { Request } from 'express';

import { AuthUser } from '../common/decorators/current-user.decorator';
import { GroupsService } from './groups.service';

/**
 * Enforces CLAUDE.md's rule that a user may only read or post in a group they belong to —
 * "with a Guard, not ad-hoc checks". Centralising it here means the rule is written once and
 * cannot be forgotten on a new group-scoped endpoint.
 *
 * Lives in groups/ rather than common/ because it is group-specific in every way that matters: it
 * reads `params.id` as a group id, and it applies one particular domain rule. Keeping it under
 * common/ made it *look* like shared infrastructure while it depended on group semantics — and it
 * forced the alternative of either duplicating GroupsService.assertMember or having common/ import
 * a feature module. Moving the file removes that dilemma instead of choosing a side of it.
 *
 * Runs AFTER the global JwtAuthGuard (global guards execute before route guards), so req.user is
 * already populated.
 *
 * The rule itself is NOT reimplemented here — it delegates to GroupsService.assertMember, which is
 * the same method ChatGateway uses for the WebSocket path. One rule, one query, two transports.
 * A malformed id and a valid id with no membership both raise the same 403 with the same message,
 * so the endpoint never leaks which groups exist to non-members.
 */
@Injectable()
export class GroupMemberGuard implements CanActivate {
  constructor(private readonly groups: GroupsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Typed params: every route this guard protects is nested under :id (the group id), so the
    // generic states that rather than letting it widen to string | string[].
    const request = context.switchToHttp().getRequest<
      Request<{ id: string }> & {
        user?: AuthUser;
        groupMembership?: GroupMember;
      }
    >();

    const user = request.user;
    // Step 2. Defensive — the global JwtAuthGuard should have populated this already.
    if (!user) {
      throw new UnauthorizedException();
    }

    // Throws ForbiddenException on a malformed id or a non-membership; returns the row otherwise.
    const membership = await this.groups.assertMember(
      user.userId,
      request.params.id,
    );

    // Surface the loaded membership so handlers needing the caller's role don't re-query.
    request.groupMembership = membership;
    // Step 4. `true` lets the request through; every rejection above was a thrown exception.
    return true;
  }
}
