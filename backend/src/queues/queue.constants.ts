import { FlowJob } from 'bullmq';

// Four queues (matching the assignment): a scheduler queue plus one per work type.
export const SCHEDULER_QUEUE = 'scheduler-queue';
export const AI_QUEUE = 'ai-queue';
export const SUMMARY_QUEUE = 'summary-queue';
export const NOTIFICATION_QUEUE = 'notification-queue';

// FlowProducer name (registered by the scheduler worker; injected with @InjectFlowProducer).
export const SUMMARY_FLOW = 'summary-flow';

/**
 * Id of the repeatable scheduler registered with upsertJobScheduler.
 *
 * upsertJobScheduler is idempotent PER ID — so a typo does not replace the existing scheduler, it
 * registers a SECOND one beside it while the original keeps firing from Redis state. Every active
 * group would then be summarized twice, and nothing would fail. Its siblings (queue names, job
 * names) are already centralized here, including JOB_SCHEDULER_TICK, which is passed in the very
 * same upsertJobScheduler call.
 */
export const SUMMARY_SCHEDULER_ID = 'daily-summary';

/**
 * Id of the second repeatable job on the scheduler queue: the refresh-token purge.
 *
 * A distinct id from SUMMARY_SCHEDULER_ID, because upsertJobScheduler is idempotent PER ID — the
 * two schedules must not overwrite one another. Its own id, its own interval, its own job name.
 */
export const TOKEN_PURGE_SCHEDULER_ID = 'refresh-token-purge';

// Job names — also used as the jobId prefix per stage.
export const JOB_SCHEDULER_TICK = 'scheduler-tick';
export const JOB_TOKEN_PURGE = 'refresh-token-purge';
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
 * @Processor options are evaluated at import time and cannot inject ConfigService (the same
 * static-decorator constraint as the Phase 3 socket CORS). Each standalone worker entry point
 * loads dotenv BEFORE importing its module, so process.env is already populated by the time this
 * runs inside the decorator.
 *
 * Named `intFromEnv` rather than `concurrencyFromEnv` because the AI rate limiter needs the same
 * escape hatch — the body was always generic.
 */
export const intFromEnv = (key: string, fallback: number): number => {
  const raw = process.env[key];
  const n = raw !== undefined ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * Per-worker concurrency: the env KEY and its DEFAULT, together, once.
 *
 * Both halves used to be written twice — as a bare string plus a number inside each @Processor
 * decorator, and again as a defaulted field on EnvironmentVariables — with nothing linking them.
 * That is a silent failure waiting to happen in two directions:
 *   - the two defaults can drift apart, and the decorator's copy is the one that actually runs;
 *   - `concurrencyFromEnv` returns its fallback for ANY value it cannot parse, including a key
 *     that does not exist, so a mistyped 'AI_WORKER_CONCURENCY' compiles, boots, passes env
 *     validation and runs at the wrong concurrency forever, with no error anywhere.
 *
 * Both the decorators and the env schema now read from this map, so the key and the default have
 * exactly one definition each.
 */
export const WORKER_CONCURRENCY = {
  SCHEDULER: { key: 'SCHEDULER_WORKER_CONCURRENCY', default: 1 },
  AI: { key: 'AI_WORKER_CONCURRENCY', default: 10 },
  SUMMARY: { key: 'SUMMARY_WORKER_CONCURRENCY', default: 5 },
  NOTIFICATION: { key: 'NOTIFICATION_WORKER_CONCURRENCY', default: 3 },
} as const;

/** Resolve a worker's concurrency from its env key, falling back to its declared default. */
export const concurrencyFor = (
  worker: keyof typeof WORKER_CONCURRENCY,
): number => {
  const { key, default: fallback } = WORKER_CONCURRENCY[worker];
  return intFromEnv(key, fallback);
};

/** A flow stage has exactly one child; return its BullMQ return value (or undefined). */
export const firstChildValue = <T>(
  values: Record<string, T>,
): T | undefined => {
  const all = Object.values(values);
  return all.length > 0 ? all[0] : undefined;
};
