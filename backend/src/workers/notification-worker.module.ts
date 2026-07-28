/**
 * HOW THIS FILE WORKS
 *
 *   1. Import AppConfigModule for ConfigService and the validated env.
 *   2. Open the shared Redis connection used by every BullMQ queue in this process.
 *   3. Register notification-queue, the queue this worker drains.
 *   4. Import NotificationsModule, which supplies the Redis-emitter publisher.
 *   5. Declare PublishProcessor — registering it IS what starts the worker.
 *
 * The DI graph for the notification-worker process. Like the ai-worker it has NO PrismaModule:
 * the row was already written by save-summary, and this stage receives it as a value from its
 * child, so broadcasting needs no database access.
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '../config/config.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { bullConnectionFactory } from '../config/redis.config';
import { NOTIFICATION_QUEUE } from '../queues/queue.constants';
import { PublishProcessor } from '../summary/stages/publish.processor';

@Module({
  imports: [
    // Step 1. ConfigService; the publisher also reads REDIS_* through it for its own connection.
    AppConfigModule,
    // Step 2. The BullMQ connection. Note this is separate from the publisher's ioredis client —
    // the emitter needs its own connection because it publishes on Socket.IO's channels, not
    // BullMQ's.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    // Step 3. The queue carrying the single publish-summary job type.
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
    // Step 4. Exports NotificationPublisher, PublishProcessor's only dependency.
    NotificationsModule,
  ],
  // Step 5. Carries @Processor, so listing it here starts the worker for notification-queue.
  providers: [PublishProcessor],
})
export class NotificationWorkerModule {}
