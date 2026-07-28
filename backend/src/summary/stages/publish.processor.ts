/**
 * HOW THIS FILE WORKS
 *
 *   1. BullMQ hands this processor a publish-summary job from notification-queue.
 *   2. Read the return value of its ONE child (save-summary) via getChildrenValues().
 *   3. If the child skipped, report published:false and stop — there is no row to broadcast.
 *   4. Otherwise emit the persisted row to the group's Socket.IO room over the Redis emitter.
 *   5. Return published:true, which the group-summary root reads to close out the flow.
 *
 * Stage 4 of 5, and the last one that does work. Its child is save-summary (summary-queue); its
 * parent is the group-summary root. This process has no Socket.IO server — see the docblock below
 * for how it still reaches connected browsers.
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
  // Lowest of the four (default 3): a broadcast is a single Redis publish, so there is nothing to
  // gain from running many at once, and no external rate limit to respect.
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
    // Step 2. One child, so firstChildValue unwraps the map to the single SaveResult.
    const child = firstChildValue<SaveResult>(await job.getChildrenValues());
    // Step 3. A skip anywhere upstream lands here as `skipped`, and there is simply nothing to
    // send. Note this is a normal completion, not a failure — the flow still succeeds.
    if (!child || child.skipped) return { published: false };

    // Step 4. Fire-and-forget: the emitter publishes to Redis and returns. Deliberately NOT
    // awaited or wrapped in try/catch — see the docblock on ordering. The message is already
    // persisted, so the worst outcome here is a missed live update, never lost data.
    this.publisher.broadcastNewMessage(child.message);
    // The last line of a successful run — seeing this means the summary reached the room.
    this.logger.log(`group ${child.message.groupId}: summary broadcast`);
    // Step 5. The root job reads this to report whether the chain ended in a broadcast.
    return { published: true };
  }
}
