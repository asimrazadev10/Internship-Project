export const SUMMARY_QUEUE = 'summary';
export const JOB_SCHEDULER = 'scheduler';
export const JOB_GROUP_SUMMARY = 'group-summary';

/**
 * Deterministic id so a scheduler double-fire (or an overlapping manual + scheduled run) within the
 * same window enqueues the SAME job id — BullMQ then dedupes it instead of summarizing twice.
 */
export const groupSummaryJobId = (
  groupId: string,
  bucketStart: number,
): string => `gs:${groupId}:${bucketStart}`;
