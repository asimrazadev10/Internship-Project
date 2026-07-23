import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

import { AiSummaryService } from '../ai/ai-summary.service';
import { MessagesService } from '../messages/messages.service';
import {
  JOB_GROUP_SUMMARY,
  JOB_SCHEDULER,
  SUMMARY_QUEUE,
  groupSummaryJobId,
} from './summary.constants';
import { SummaryService } from './summary.service';

// Rate limiter is a CONSTANT: the @Processor decorator is evaluated at import time and cannot inject
// ConfigService (same trap as the Phase 3 socket-CORS-in-decorator bug). It caps Gemini calls so
// many active groups drain safely under the free-tier per-minute limit.
// Note: against the installed @nestjs/bullmq (v11), ProcessorOptions (the single-object first-arg
// form) has only name/scope/configKey — no `limiter`. `limiter` lives on NestWorkerOptions, the
// SECOND argument (it extends BullMQ's WorkerOptions), so the two-argument form is required here.
@Processor(SUMMARY_QUEUE, { limiter: { max: 10, duration: 60_000 } })
export class SummaryProcessor extends WorkerHost {
  private readonly logger = new Logger(SummaryProcessor.name);

  constructor(
    @InjectQueue(SUMMARY_QUEUE) private readonly queue: Queue,
    private readonly summaryService: SummaryService,
    private readonly messages: MessagesService,
    private readonly ai: AiSummaryService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOB_SCHEDULER) return this.runScheduler();
    if (job.name === JOB_GROUP_SUMMARY) {
      return this.runGroupSummary((job.data as { groupId: string }).groupId);
    }
  }

  /** Fan-out: find active groups, enqueue one isolated job per group. */
  private async runScheduler(): Promise<void> {
    const windowMs = this.config.getOrThrow<number>('SUMMARY_WINDOW_MS');
    const since = new Date(Date.now() - windowMs);
    const bucketStart = Math.floor(Date.now() / windowMs) * windowMs;

    const groups = await this.summaryService.findActiveGroups(since);
    this.logger.log(`scheduler: ${groups.length} active group(s)`);

    for (const g of groups) {
      await this.queue.add(
        JOB_GROUP_SUMMARY,
        { groupId: g.id },
        {
          jobId: groupSummaryJobId(g.id, bucketStart),
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
  }

  // runGroupSummary is implemented in Task 6.
  private async runGroupSummary(groupId: string): Promise<void> {
    void groupId;
  }
}
