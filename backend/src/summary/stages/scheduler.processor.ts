/**
 * HOW THIS FILE WORKS
 *   1. On boot, register two repeatable jobs: the summary tick and the token purge.
 *   2. When either fires, process() switches on job.name and delegates.
 *   3. fanOutSummaries() computes the window (`since`) and its stable id (`bucketStart`).
 *   4. It finds the active groups and adds one Flow per group.
 *   5. purgeTokens() runs the housekeeping delete, swallowing its own errors.
 *
 * Stage 0 — the clock. It creates flows rather than being part of one. The same tick is what
 * POST /summaries/run enqueues, so the demo path and the scheduled path are identical from here.
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
  // Deliberately 1: two concurrent ticks would fan out the same groups twice.
  concurrency: concurrencyFor('SCHEDULER'),
})
// OnApplicationBootstrap gives a hook that runs once after the DI graph is built.
export class SchedulerProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  // Tagged [SchedulerProcessor]; the first sign of life in the scheduler worker.
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    // The queue as a producer, used to register the two repeatable schedulers.
    @InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue,
    // Adds a parent/child tree atomically; a plain Queue could only add flat jobs.
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
    // Step 1a. getOrThrow: a missing interval stops the worker at boot, not at the first tick.
    const every = this.config.getOrThrow<number>('SUMMARY_INTERVAL_MS');
    // Idempotent PER ID, which is what makes re-running this on every boot safe.
    await this.queue.upsertJobScheduler(
      SUMMARY_SCHEDULER_ID,
      { every },
      { name: JOB_SCHEDULER_TICK, data: {} },
    );
    // Confirms the interval actually in force — useful after lowering it to demo the pipeline.
    this.logger.log(`summary scheduler registered (every ${every}ms)`);

    // A SECOND repeatable job on the same queue, under its own id so the two schedules cannot
    // overwrite each other. Housekeeping rides on the queue infrastructure Phase 5 already built
    // rather than adding a parallel mechanism for it.
    const purgeEvery = this.config.getOrThrow<number>(
      'TOKEN_PURGE_INTERVAL_MS',
    );
    // Step 1b. Its own id — reusing SUMMARY_SCHEDULER_ID would replace the summary schedule.
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
        // Complete quietly rather than fail a job this code did not create.
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
      // Step 5. Deletes refresh tokens expired longer ago than the grace period.
      await this.tokens.purgeExpired();
    } catch (err) {
      // Logged, not rethrown — the job still completes successfully.
      this.logger.error('refresh-token purge failed', err as Error);
    }
  }

  private async fanOutSummaries(): Promise<void> {
    // Step 3a. How far back a summary reads — separate knob from the tick interval.
    const windowMs = this.config.getOrThrow<number>('SUMMARY_WINDOW_MS');
    // Read the clock once so every group in this tick shares an identical window.
    const now = Date.now();
    // The lower bound handed to the fetch stage.
    const since = new Date(now - windowMs);
    // Step 3b. Snap to a window boundary — this is what makes the stage job ids deterministic.
    const bucketStart = Math.floor(now / windowMs) * windowMs;

    // Step 4a. Only groups with real activity; an idle group costs nothing.
    const groups = await this.summary.findActiveGroups(since);
    // The count to check first when a run produces no summaries.
    this.logger.log(`scheduler: ${groups.length} active group(s)`);

    for (const g of groups) {
      try {
        // Step 4b. One independent flow per group — isolation is the point.
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
