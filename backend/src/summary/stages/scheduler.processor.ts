import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectFlowProducer, InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { FlowProducer, Job, Queue } from 'bullmq';

import {
  SCHEDULER_QUEUE,
  SUMMARY_FLOW,
  JOB_SCHEDULER_TICK,
  buildSummaryFlow,
  concurrencyFromEnv,
} from '../../queues/queue.constants';
import { SummaryService } from '../summary.service';

/**
 * Stage 0: the repeatable tick (also fired by POST /summaries/run) that fans out one BullMQ Flow
 * per active group. upsertJobScheduler is idempotent, so registering it on every worker boot is
 * safe. Each flow is fully isolated — one group's failure never touches another's.
 */
@Processor(SCHEDULER_QUEUE, {
  concurrency: concurrencyFromEnv('SCHEDULER_WORKER_CONCURRENCY', 1),
})
export class SchedulerProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    @InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue,
    @InjectFlowProducer(SUMMARY_FLOW) private readonly flow: FlowProducer,
    private readonly summary: SummaryService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    const every = this.config.getOrThrow<number>('SUMMARY_INTERVAL_MS');
    await this.queue.upsertJobScheduler(
      'daily-summary',
      { every },
      { name: JOB_SCHEDULER_TICK, data: {} },
    );
    this.logger.log(`summary scheduler registered (every ${every}ms)`);
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOB_SCHEDULER_TICK) return;

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
        this.logger.error(`group ${g.id}: failed to enqueue summary flow`, err as Error);
        continue;
      }
    }
  }
}
