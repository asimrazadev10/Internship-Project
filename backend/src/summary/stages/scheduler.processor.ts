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
  concurrency: concurrencyFor('SCHEDULER'),
})
export class SchedulerProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    @InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue,
    @InjectFlowProducer(SUMMARY_FLOW) private readonly flow: FlowProducer,
    private readonly summary: SummaryService,
    private readonly tokens: RefreshTokenPurgeService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    const every = this.config.getOrThrow<number>('SUMMARY_INTERVAL_MS');
    await this.queue.upsertJobScheduler(
      SUMMARY_SCHEDULER_ID,
      { every },
      { name: JOB_SCHEDULER_TICK, data: {} },
    );
    this.logger.log(`summary scheduler registered (every ${every}ms)`);

    // A SECOND repeatable job on the same queue, under its own id so the two schedules cannot
    // overwrite each other. Housekeeping rides on the queue infrastructure Phase 5 already built
    // rather than adding a parallel mechanism for it.
    const purgeEvery = this.config.getOrThrow<number>(
      'TOKEN_PURGE_INTERVAL_MS',
    );
    await this.queue.upsertJobScheduler(
      TOKEN_PURGE_SCHEDULER_ID,
      { every: purgeEvery },
      { name: JOB_TOKEN_PURGE, data: {} },
    );
    this.logger.log(`token purge scheduled (every ${purgeEvery}ms)`);
  }

  /** One queue, two repeatable jobs — dispatch on name, as the stage processors do. */
  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_SCHEDULER_TICK:
        return this.fanOutSummaries();
      case JOB_TOKEN_PURGE:
        return this.purgeTokens();
      default:
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
      await this.tokens.purgeExpired();
    } catch (err) {
      this.logger.error('refresh-token purge failed', err as Error);
    }
  }

  private async fanOutSummaries(): Promise<void> {
    const windowMs = this.config.getOrThrow<number>('SUMMARY_WINDOW_MS');
    const now = Date.now();
    const since = new Date(now - windowMs);
    const bucketStart = Math.floor(now / windowMs) * windowMs;

    const groups = await this.summary.findActiveGroups(since);
    this.logger.log(`scheduler: ${groups.length} active group(s)`);

    for (const g of groups) {
      try {
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
