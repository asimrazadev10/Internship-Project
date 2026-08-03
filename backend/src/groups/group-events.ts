/**
 * HOW THIS FILE WORKS
 *   1. MEMBER_JOINED and its payload — emitted when a membership row is created.
 *   2. READ_MARKED and its payload — emitted when a member marks the group read.
 *
 * The groups module's half of the in-process event contract; ChatGateway is the only listener.
 */
import { MemberRole } from '../modules/groups/schemas/group-member.schema';

/** Emitted after a new membership row is persisted (a user joins a group). Any transport listens. */
export const MEMBER_JOINED = 'member.joined';

/**
 * The member shape selected by GroupsService.join — deliberately identical to one item of the
 * `members[]` array returned by GET /groups/:id, so the frontend can append it straight into the
 * cached group detail without reshaping.
 */
export interface JoinedMember {
  id: string;
  groupId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
  // Nullable: a member who has never opened the group has no read timestamp yet.
  lastReadAt: Date | null;
  user: { id: string; name: string; email: string };
}

export interface MemberJoinedPayload {
  // groupId is carried separately because the gateway needs it to resolve the room.
  groupId: string;
  member: JoinedMember;
}

/** Emitted after a member marks a group read, so the gateway can broadcast a read receipt. */
export const READ_MARKED = 'read.marked';

export interface ReadMarkedPayload {
  groupId: string;
  userId: string;
  lastReadAt: Date;
}

/** Emitted after a member's row is deleted, so the gateway can broadcast and evict their sockets. */
export const MEMBER_LEFT = 'member.left';

export interface MemberLeftPayload {
  groupId: string;
  // Ids only: the member row is gone, so there is no shape left to send.
  userId: string;
}

/** Emitted after ownership moves, by explicit transfer or by an owner leaving. */
export const OWNER_CHANGED = 'owner.changed';

export interface OwnerChangedPayload {
  groupId: string;
  previousOwnerId: string;
  newOwnerId: string;
}
