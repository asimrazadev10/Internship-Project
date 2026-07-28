/**
 * HOW THIS FILE WORKS
 *   1. One constant: the per-dependency timeout used by the readiness probes.
 */

/**
 * How long a single readiness dependency check may take before it is called down.
 *
 * Deliberately short. A readiness probe is polled on a fixed interval by whatever is supervising
 * the process, so it must answer well inside that interval — an answer of "down" arriving quickly
 * is strictly more useful than an accurate answer arriving after the probe has already timed out.
 */
// Applied per check, and both run in parallel, so 2s is the ceiling for the whole endpoint.
export const DEPENDENCY_CHECK_TIMEOUT_MS = 2000;
