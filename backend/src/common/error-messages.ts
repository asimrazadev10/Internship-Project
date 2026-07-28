/**
 * HOW THIS FILE WORKS
 *   1. One export: the message returned identically for "no such group" and "not a member".
 *
 * The bar for adding anything here is that the exact wording carries a security guarantee.
 */

/**
 * Error strings that carry a security invariant.
 *
 * Deliberately NOT a home for user-facing copy in general — copy belongs where it is rendered.
 * The bar for landing here is that the exact wording is load-bearing, i.e. changing it in one
 * place and not another would weaken a guarantee rather than just look inconsistent.
 *
 * Transport-neutral on purpose: these are returned over HTTP (as an exception) AND over the
 * WebSocket (as an ack payload), so this cannot live in common/http/api-response.ts, which models
 * the HTTP envelope. It also cannot live in groups/, because common/guards importing from a
 * feature module would invert the layering.
 */

/**
 * Returned for BOTH "this group does not exist" and "you are not a member of it".
 *
 * The identical wording is the security property: if the two cases produced different responses,
 * a non-member could probe which group ids exist. GroupMemberGuard and GroupsService.assertMember
 * each document this rule, and ChatGateway returns the same string in its socket acks — six sites
 * previously kept in agreement by discipline alone, with no test that would fail if one drifted.
 */
export const NOT_A_MEMBER_MESSAGE = 'You are not a member of this group';
