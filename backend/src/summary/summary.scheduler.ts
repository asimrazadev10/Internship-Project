import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { JOB_SCHEDULER, SUMMARY_QUEUE } from './summary.constants';

/** Registers the repeatable scheduler tick once the app is up. upsertJobScheduler is idempotent. */
@Injectable()
export class SummaryScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SummaryScheduler.name);

  constructor(
    @InjectQueue(SUMMARY_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const every = this.config.getOrThrow<number>('SUMMARY_INTERVAL_MS');
    await this.queue.upsertJobScheduler(
      'daily-summary',
      { every },
      { name: JOB_SCHEDULER, data: {} },
    );
    this.logger.log(`summary scheduler registered (every ${every}ms)`);
  }
}
