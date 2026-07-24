import { FlowJob } from 'bullmq';

// Four queues (matching the assignment): a scheduler queue plus one per work type.
export const SCHEDULER_QUEUE = 'scheduler-queue';
export const AI_QUEUE = 'ai-queue';
export const SUMMARY_QUEUE = 'summary-queue';
export const NOTIFICATION_QUEUE = 'notification-queue';

// FlowProducer name (registered by the scheduler worker; injected with @InjectFlowProducer).
export const SUMMARY_FLOW = 'summary-flow';

// Job names — also used as the jobId prefix per stage.
export const JOB_SCHEDULER_TICK = 'scheduler-tick';
export const JOB_GROUP_SUMMARY = 'group-summary'; // the per-group parent job (flow root)
export const JOB_FETCH = 'fetch-messages'; // leaf — reads the window's messages
export const JOB_GENERATE = 'generate-ai-summary';
export const JOB_SAVE = 'save-summary';
export const JOB_PUBLISH = 'publish-summary';

/**
 * Deterministic id so a re-fired flow within the same window reuses the SAME ids per stage and
 * BullMQ dedupes instead of summarizing twice. `hasSummarySince` (in the fetch stage) is the
 * DB-level guarantee behind this best-effort queue-level dedup.
 */
export const stageJobId = (
  stage: string,
  groupId: string,
  bucketStart: number,
): string => `${stage}:${groupId}:${bucketStart}`;

// Shared per-job policy: bounded retries with exponential backoff; keep the queue tidy.
const jobOpts = (jobId: string) => ({
  jobId,
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: true,
  removeOnFail: 100,
});

/**
 * One group's pipeline as a BullMQ Flow, matching the assignment's tree:
 *
 *   group-summary          (parent, summary-queue) — completes only after ALL children succeed
 *     └─ publish-summary   (notification-queue)
 *          └─ save-summary (summary-queue)
 *               └─ generate-ai-summary (ai-queue)
 *                    └─ fetch-messages  (summary-queue, leaf — runs FIRST)
 *
 * A NESTED chain rather than four flat siblings, because the stages are strictly sequential: each
 * reads the previous stage's return via job.getChildrenValues(). `failParentOnFailure` bubbles a
 * failed child up so the whole flow fails cleanly instead of leaving a parent stuck in
 * waiting-children — no half-written state.
 */
export const buildSummaryFlow = (
  groupId: string,
  since: Date,
  bucketStart: number,
): FlowJob => ({
  name: JOB_GROUP_SUMMARY,
  queueName: SUMMARY_QUEUE,
  data: { groupId },
  opts: jobOpts(stageJobId(JOB_GROUP_SUMMARY, groupId, bucketStart)),
  children: [
    {
      name: JOB_PUBLISH,
      queueName: NOTIFICATION_QUEUE,
      data: { groupId },
      opts: {
        ...jobOpts(stageJobId(JOB_PUBLISH, groupId, bucketStart)),
        failParentOnFailure: true,
      },
      children: [
        {
          name: JOB_SAVE,
          queueName: SUMMARY_QUEUE,
          data: { groupId },
          opts: {
            ...jobOpts(stageJobId(JOB_SAVE, groupId, bucketStart)),
            failParentOnFailure: true,
          },
          children: [
            {
              name: JOB_GENERATE,
              queueName: AI_QUEUE,
              data: { groupId },
              opts: {
                ...jobOpts(stageJobId(JOB_GENERATE, groupId, bucketStart)),
                failParentOnFailure: true,
              },
              children: [
                {
                  name: JOB_FETCH,
                  queueName: SUMMARY_QUEUE,
                  data: { groupId, since: since.toISOString() },
                  opts: {
                    ...jobOpts(stageJobId(JOB_FETCH, groupId, bucketStart)),
                    failParentOnFailure: true,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

/**
 * The @Processor concurrency option is evaluated at import time and cannot inject ConfigService
 * (same static-decorator constraint as the Phase 3 socket CORS and the Phase 4 rate limiter). Each
 * standalone worker entry point loads dotenv BEFORE importing its module, so process.env is already
 * populated by the time this runs inside the decorator.
 */
export const concurrencyFromEnv = (key: string, fallback: number): number => {
  const raw = process.env[key];
  const n = raw !== undefined ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** A flow stage has exactly one child; return its BullMQ return value (or undefined). */
export const firstChildValue = <T>(values: Record<string, T>): T | undefined => {
  const all = Object.values(values);
  return all.length > 0 ? all[0] : undefined;
};
