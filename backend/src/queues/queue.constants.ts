/**
 * HOW THIS FILE WORKS
 *   1. Name the four queues and the FlowProducer.
 *   2. Name the two scheduler ids and the six job types.
 *   3. stageJobId() builds a deterministic id per stage, which is what dedupes a re-fired flow.
 *   4. jobOpts() sets the shared retry/backoff/cleanup policy for every flow job.
 *   5. buildSummaryFlow() assembles one group's five-stage tree.
 *   6. intFromEnv / WORKER_CONCURRENCY / concurrencyFor read tuning knobs before DI exists.
 *   7. firstChildValue() unwraps a stage's single child return value.
 *
 * Every string here is referenced from at least two processes, so a typo in one of them would
 * produce a worker that silently drains nothing.
 */
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
// Step 3. bucketStart is constant within a window, so the id is stable across re-fires.
export const stageJobId = (
  stage: string,
  groupId: string,
  bucketStart: number,
): string => `${stage}:${groupId}:${bucketStart}`;

// Shared per-job policy: bounded retries with exponential backoff; keep the queue tidy.
const jobOpts = (jobId: string) => ({
  jobId,
  // Step 4. Three tries, then the job fails for good.
  attempts: 3,
  // Doubling delay from 2s, so a struggling dependency is not hammered.
  backoff: { type: 'exponential' as const, delay: 2000 },
  // Success deletes the job — which is why a healthy pipeline shows empty queues.
  removeOnComplete: true,
  // Keep the last 100 failures so failedReason is still readable afterwards.
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
  // Step 5. The root. Runs last, after every descendant has succeeded.
  name: JOB_GROUP_SUMMARY,
  queueName: SUMMARY_QUEUE,
  data: { groupId },
  opts: jobOpts(stageJobId(JOB_GROUP_SUMMARY, groupId, bucketStart)),
  children: [
    {
      // Stage 4 — broadcast. Note the queue changes, so this runs in another process.
      name: JOB_PUBLISH,
      queueName: NOTIFICATION_QUEUE,
      data: { groupId },
      opts: {
        ...jobOpts(stageJobId(JOB_PUBLISH, groupId, bucketStart)),
        // Bubbles failure to the root instead of parking it in waiting-children forever.
        failParentOnFailure: true,
      },
      children: [
        {
          // Stage 3 — persist. Back on summary-queue.
          name: JOB_SAVE,
          queueName: SUMMARY_QUEUE,
          data: { groupId },
          opts: {
            ...jobOpts(stageJobId(JOB_SAVE, groupId, bucketStart)),
            failParentOnFailure: true,
          },
          children: [
            {
              // Stage 2 — the Gemini call, isolated on its own queue and process.
              name: JOB_GENERATE,
              queueName: AI_QUEUE,
              data: { groupId },
              opts: {
                ...jobOpts(stageJobId(JOB_GENERATE, groupId, bucketStart)),
                failParentOnFailure: true,
              },
              children: [
                {
                  // Stage 1 — the leaf, so this is what actually runs first.
                  name: JOB_FETCH,
                  queueName: SUMMARY_QUEUE,
                  // `since` is serialised to ISO because job data crosses Redis as JSON.
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
  // Step 6. Reads process.env directly — ConfigService does not exist this early.
  const raw = process.env[key];
  // Number('') is 0 and Number(undefined) is NaN, both rejected by the guard below.
  const n = raw !== undefined ? Number(raw) : NaN;
  // Falls back on anything non-integer or non-positive — including a key that does not exist.
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
  // 1 — two concurrent ticks would fan out the same groups twice.
  SCHEDULER: { key: 'SCHEDULER_WORKER_CONCURRENCY', default: 1 },
  // 10 — network-bound and mostly idle, so parallelism is cheap here.
  AI: { key: 'AI_WORKER_CONCURRENCY', default: 10 },
  // 5 — short DB round-trips, bounded by the Postgres pool.
  SUMMARY: { key: 'SUMMARY_WORKER_CONCURRENCY', default: 5 },
  // 3 — a broadcast is one Redis publish; there is little to gain from more.
  NOTIFICATION: { key: 'NOTIFICATION_WORKER_CONCURRENCY', default: 3 },
} as const;

/** Resolve a worker's concurrency from its env key, falling back to its declared default. */
export const concurrencyFor = (
  worker: keyof typeof WORKER_CONCURRENCY,
): number => {
  // Keyed lookup, so the decorators cannot name an env var the schema does not validate.
  const { key, default: fallback } = WORKER_CONCURRENCY[worker];
  return intFromEnv(key, fallback);
};

/** A flow stage has exactly one child; return its BullMQ return value (or undefined). */
export const firstChildValue = <T>(
  values: Record<string, T>,
): T | undefined => {
  // Step 7. getChildrenValues() keys results by child job id, which callers do not know.
  const all = Object.values(values);
  // undefined rather than a throw, so callers handle a missing child as a skip.
  return all.length > 0 ? all[0] : undefined;
};
