import { MemberRole } from '@prisma/client';

/** Emitted after a new membership row is persisted (a user joins a group). Any transport listens. */
export const MEMBER_JOINED = 'member.joined';

/**
 * The member shape selected by GroupsService.join — deliberately identical to one item of the
 * `members[]` array returned by GET /groups/:id, so the frontend can append it straight into the
 * cached group detail without reshaping.
 */
export interface JoinedMember {
  role: MemberRole;
  joinedAt: Date;
  user: { id: string; name: string; email: string };
}

export interface MemberJoinedPayload {
  groupId: string;
  member: JoinedMember;
}
