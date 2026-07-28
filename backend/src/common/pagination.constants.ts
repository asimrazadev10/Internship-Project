/**
 * HOW THIS FILE WORKS
 *   1. DEFAULT_PAGE_SIZE — used when the client sends no limit.
 *   2. MAX_PAGE_SIZE — the hard ceiling, enforced by validation.
 */

/**
 * Cursor-pagination policy, shared by every list endpoint that accepts PaginationQueryDto.
 *
 * MAX_PAGE_SIZE is the load-bearing one: without a cap a client can ask for an unbounded page,
 * which is a cheap way to strain both the database and the response. DEFAULT_PAGE_SIZE is what a
 * caller gets when it does not ask — the frontend mirrors it so its infinite-scroll pages line up
 * with what the server actually returns.
 */

/** Page size when the client does not specify one. */
export const DEFAULT_PAGE_SIZE = 20;

/** Hard ceiling on a single page. Requests above this are rejected by validation, not clamped. */
// Rejected rather than clamped, so a client asking for 1000 learns it was wrong.
export const MAX_PAGE_SIZE = 100;
