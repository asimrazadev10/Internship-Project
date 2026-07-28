/**
 * HOW THIS FILE WORKS
 *
 *   1. On worker boot, onApplicationBootstrap registers TWO repeatable jobs on scheduler-queue:
 *      the summary tick, and the unrelated refresh-token purge. Each has its own id and interval.
 *   2. When either fires, process() switches on job.name and delegates.
 *   3. fanOutSummaries() computes the window (`since`) and its stable id (`bucketStart`).
 *   4. It asks SummaryService which groups have been active, then adds ONE Flow per group.
 *   5. purgeTokens() runs the housekeeping delete, swallowing its own errors on purpose.
 *
 * Stage 0 — the clock. It is not part of the Flow; it CREATES flows. Nothing else in the system
 * schedules anything, so if this processor is not running, no summary is ever produced.
 *
 * The same tick is also what POST /summaries/run enqueues, which is why the manual demo path and
 * the scheduled path are indistinguishable from here down.
 */
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InjectFlowProducer,
  InjectQueue,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { FlowProducer, Job, Queue } from 'bullmq';

import { RefreshTokenPurgeService } from '../../auth/refresh-token-purge.service';
import {
  SCHEDULER_QUEUE,
  SUMMARY_FLOW,
  SUMMARY_SCHEDULER_ID,
  TOKEN_PURGE_SCHEDULER_ID,
  JOB_SCHEDULER_TICK,
  JOB_TOKEN_PURGE,
  buildSummaryFlow,
  concurrencyFor,
} from '../../queues/queue.constants';
import { SummaryService } from '../summary.service';

/**
 * Stage 0: the repeatable tick (also fired by POST /summaries/run) that fans out one BullMQ Flow
 * per active group. upsertJobScheduler is idempotent, so registering it on every worker boot is
 * safe. Each flow is fully isolated — one group's failure never touches another's.
 *
 * It also owns a SECOND, unrelated repeatable job: the refresh-token purge. Both are periodic
 * maintenance on the same queue, distinguished by job name, so scheduled housekeeping reuses the
 * Phase 5 queue infrastructure instead of introducing a second scheduling mechanism beside it.
 */
@Processor(SCHEDULER_QUEUE, {
  // Deliberately 1. Two ticks running at once would fan out the same groups twice and race on the
  // deterministic job ids, so there is nothing to gain from parallelism here.
  concurrency: concurrencyFor('SCHEDULER'),
})
// Implements OnApplicationBootstrap, which gives this class a hook that runs once after the DI
// graph is built — the correct place to register the two repeatable schedulers.
export class SchedulerProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  // Tagged [SchedulerProcessor]; its lines are the first sign of life in the scheduler worker.
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    // The queue as a PRODUCER, used to register the two repeatable schedulers.
    @InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue,
    // The FlowProducer, which adds a whole parent/child TREE atomically — a plain Queue could only
    // add flat jobs and could not express the five-stage chain.
    @InjectFlowProducer(SUMMARY_FLOW) private readonly flow: FlowProducer,
    // The single "which groups are active" query.
    private readonly summary: SummaryService,
    // The unrelated housekeeping service riding on this same queue.
    private readonly tokens: RefreshTokenPurgeService,
    // Supplies the two intervals and the window size.
    private readonly config: ConfigService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    // Step 1a. getOrThrow: a missing interval must stop the worker at boot, not at the first tick.
    const every = this.config.getOrThrow<number>('SUMMARY_INTERVAL_MS');
    // upsertJobScheduler is idempotent PER ID, which is what makes re-running this on every boot
    // safe — it updates the existing schedule rather than stacking a second one.
    await this.queue.upsertJobScheduler(
      SUMMARY_SCHEDULER_ID,
      { every },
      { name: JOB_SCHEDULER_TICK, data: {} },
    );
    // Confirms the interval actually in force — useful when SUMMARY_INTERVAL_MS was lowered to
    // demo the pipeline and you need to see that the change took.
    this.logger.log(`summary scheduler registered (every ${every}ms)`);

    // A SECOND repeatable job on the same queue, under its own id so the two schedules cannot
    // overwrite each other. Housekeeping rides on the queue infrastructure Phase 5 already built
    // rather than adding a parallel mechanism for it.
    const purgeEvery = this.config.getOrThrow<number>(
      'TOKEN_PURGE_INTERVAL_MS',
    );
    // Step 1b. Its OWN id — reusing SUMMARY_SCHEDULER_ID here would silently replace the summary
    // schedule, since upsert is keyed by id.
    await this.queue.upsertJobScheduler(
      TOKEN_PURGE_SCHEDULER_ID,
      { every: purgeEvery },
      { name: JOB_TOKEN_PURGE, data: {} },
    );
    this.logger.log(`token purge scheduled (every ${purgeEvery}ms)`);
  }

  /** One queue, two repeatable jobs — dispatch on name, as the stage processors do. */
  async process(job: Job): Promise<void> {
    // Step 2. Same pattern as SummaryProcessor: one queue can carry several job names.
    switch (job.name) {
      case JOB_SCHEDULER_TICK:
        return this.fanOutSummaries();
      case JOB_TOKEN_PURGE:
        return this.purgeTokens();
      default:
        // Unknown name: complete quietly rather than fail a job this code did not create.
        return;
    }
  }

  /**
   * Swallows its own failure deliberately. This is housekeeping: nothing downstream depends on
   * it, a delete that fails now succeeds on the next tick, and letting it throw would burn three
   * BullMQ retries hammering a database that is evidently already unwell. Summaries share this
   * queue — a failing purge must not make the queue look broken.
   */
  private async purgeTokens(): Promise<void> {
    try {
      // Step 5. Deletes refresh tokens that expired longer ago than the grace period.
      await this.tokens.purgeExpired();
    } catch (err) {
      // Logged, not rethrown — see the docblock. The job still completes successfully.
      this.logger.error('refresh-token purge failed', err as Error);
    }
  }

  private async fanOutSummaries(): Promise<void> {
    // Step 3a. How far back a summary reads. Separate from the tick interval so you can summarize
    // a 24h window every hour, or vice versa.
    const windowMs = this.config.getOrThrow<number>('SUMMARY_WINDOW_MS');
    // Read the clock ONCE so every group in this tick shares an identical window.
    const now = Date.now();
    // The lower bound handed to the fetch stage.
    const since = new Date(now - windowMs);
    // Step 3b. Snap `now` down to a window boundary. Constant for every tick inside the same
    // window, which is what makes the stage job ids deterministic — and therefore deduplicated.
    const bucketStart = Math.floor(now / windowMs) * windowMs;

    // Step 4a. Only groups with real activity; an idle group costs nothing.
    const groups = await this.summary.findActiveGroups(since);
    // The count you check first when a run produces no summaries.
    this.logger.log(`scheduler: ${groups.length} active group(s)`);

    for (const g of groups) {
      try {
        // Step 4b. One INDEPENDENT flow per group. Isolation is the point: group B's summary is
        // unaffected by anything that happens to group A's.
        await this.flow.add(buildSummaryFlow(g.id, since, bucketStart));
      } catch (err) {
        // One group's flow.add failure (e.g. a transient Redis blip) must not skip the rest of
        // the tick — log and move on so every other active group still gets summarized.
        this.logger.error(
          `group ${g.id}: failed to enqueue summary flow`,
          err as Error,
        );
        continue;
      }
    }
  }
}
