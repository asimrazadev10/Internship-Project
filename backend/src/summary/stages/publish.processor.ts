import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { NotificationPublisher } from '../../notifications/notification.publisher';
import {
  NOTIFICATION_QUEUE,
  concurrencyFromEnv,
  firstChildValue,
} from '../../queues/queue.constants';
import type { SaveResult } from './stage.types';

/**
 * Stage 3 (root): broadcast the already-persisted summary to connected clients over the Redis
 * emitter. The row exists (stage 2 ran first), so a client that renders the broadcast can always
 * refetch and find it — a dropped broadcast is recoverable, never data loss.
 */
@Processor(NOTIFICATION_QUEUE, {
  concurrency: concurrencyFromEnv('NOTIFICATION_WORKER_CONCURRENCY', 3),
})
export class PublishProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishProcessor.name);

  constructor(private readonly publisher: NotificationPublisher) {
    super();
  }

  async process(job: Job<{ groupId: string }>): Promise<{ published: boolean }> {
    const child = firstChildValue<SaveResult>(await job.getChildrenValues());
    if (!child || child.skipped) return { published: false };

    this.publisher.broadcastNewMessage(child.message);
    this.logger.log(`group ${child.message.groupId}: summary broadcast`);
    return { published: true };
  }
}
