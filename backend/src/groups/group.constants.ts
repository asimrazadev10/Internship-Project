/**
 * HOW THIS FILE WORKS
 *   1. GROUP_NAME_MAX_LENGTH — the name bound, mirrored by the frontend input.
 *   2. GROUP_MEMBER_SELECT — the member shape, shared by findOne and join so they cannot drift.
 */

/**
 * Longest permitted group name. Mirrored by the frontend's input, which caps typing so the user is
 * stopped at the boundary rather than 400'd after submitting.
 */
export const GROUP_NAME_MAX_LENGTH = 80;

/**
 * The member shape returned by group reads.
 *
 * This was written out twice — once in GroupsService.findOne's nested members select, and again in
 * join's create select — and the two MUST match, because the frontend appends the `member_joined`
 * socket payload straight into the cached group detail from findOne. If join returned a member
 * missing a field that findOne includes, the cache would hold two different shapes for the same
 * thing and the UI would read undefined off one of them.
 *
 * Only the join path was pinned to a type (`satisfies MemberJoinedPayload`); findOne's select was
 * pinned to nothing, so adding a field there alone compiled cleanly and shipped the mismatch.
 *
 * Note the explicit `user` field list: never `include: { user: true }`, which would pull the
 * password hash into the result.
 */
export const GROUP_MEMBER_SELECT = {
  role: true,
  joinedAt: true,
  lastReadAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const;
