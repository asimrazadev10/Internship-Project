import { FlowJob } from 'bullmq';

// Four queues, one per pipeline stage, each drained by its own worker process.
export const SCHEDULER_QUEUE = 'summary-scheduler';
export const AI_QUEUE = 'summary-generate';
export const SUMMARY_QUEUE = 'summary-save';
export const NOTIFICATION_QUEUE = 'summary-publish';

// FlowProducer name (registered by the scheduler worker; injected with @InjectFlowProducer).
export const SUMMARY_FLOW = 'summary-flow';

// Job names — also used as the jobId prefix per stage.
export const JOB_SCHEDULER_TICK = 'scheduler-tick';
export const JOB_GENERATE = 'generate-ai-summary';
export const JOB_SAVE = 'save-summary';
export const JOB_PUBLISH = 'publish-summary';

/**
 * Deterministic id so a re-fired flow within the same window reuses the SAME ids per stage and
 * BullMQ dedupes instead of summarizing twice. `hasSummarySince` (in the generate stage) is the
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
 * One group's pipeline as a BullMQ Flow. The ROOT is the LAST stage to run (publish); children run
 * first (generate at the leaf). Each parent reads its single child's return value via
 * job.getChildrenValues(). `failParentOnFailure` makes a permanently-failed leaf fail the whole
 * flow cleanly instead of leaving parents stuck in waiting-children — no half-written state.
 */
export const buildSummaryFlow = (
  groupId: string,
  since: Date,
  bucketStart: number,
): FlowJob => ({
  name: JOB_PUBLISH,
  queueName: NOTIFICATION_QUEUE,
  data: { groupId },
  opts: jobOpts(stageJobId(JOB_PUBLISH, groupId, bucketStart)),
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
          data: { groupId, since: since.toISOString() },
          opts: {
            ...jobOpts(stageJobId(JOB_GENERATE, groupId, bucketStart)),
            failParentOnFailure: true,
          },
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
