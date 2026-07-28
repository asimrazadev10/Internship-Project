/**
 * HOW THIS FILE WORKS
 *   1. BullMQ hands this processor a publish-summary job from notification-queue.
 *   2. Read the save-summary child's return value.
 *   3. If it skipped, report published:false — there is no row to broadcast.
 *   4. Otherwise emit the persisted row to the group's room over the Redis emitter.
 *   5. Return published:true for the group-summary root.
 *
 * Stage 4 of 5, and the last that does work. Child: save-summary. Parent: group-summary.
 */
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { NotificationPublisher } from '../../notifications/notification.publisher';
import {
  NOTIFICATION_QUEUE,
  concurrencyFor,
  firstChildValue,
} from '../../queues/queue.constants';
import type { SaveResult } from './stage.types';

/**
 * Stage 3 (root): broadcast the already-persisted summary to connected clients over the Redis
 * emitter. The row exists (stage 2 ran first), so a client that renders the broadcast can always
 * refetch and find it — a dropped broadcast is recoverable, never data loss.
 */
@Processor(NOTIFICATION_QUEUE, {
  // Lowest of the four (default 3): a broadcast is one Redis publish, with no rate limit to respect.
  concurrency: concurrencyFor('NOTIFICATION'),
})
export class PublishProcessor extends WorkerHost {
  // Tagged [PublishProcessor] in the notification-worker's output.
  private readonly logger = new Logger(PublishProcessor.name);

  // Only dependency: the emitter wrapper. No PrismaService — the row arrives as a value.
  constructor(private readonly publisher: NotificationPublisher) {
    super();
  }

  async process(
    job: Job<{ groupId: string }>,
  ): Promise<{ published: boolean }> {
    // Step 2. One child, so firstChildValue unwraps the map to a single SaveResult.
    const child = firstChildValue<SaveResult>(await job.getChildrenValues());
    // Step 3. A normal completion, not a failure — the flow still succeeds.
    if (!child || child.skipped) return { published: false };

    // Step 4. Fire-and-forget; the row is already committed, so a lost emit is recoverable.
    this.publisher.broadcastNewMessage(child.message);
    // The last line of a successful run.
    this.logger.log(`group ${child.message.groupId}: summary broadcast`);
    // Step 5. The root reads this to report whether the chain ended in a broadcast.
    return { published: true };
  }
}
