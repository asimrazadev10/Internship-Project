/**
 * HOW THIS FILE WORKS
 *   1. Import AppConfigModule for ConfigService and the validated env.
 *   2. Open the shared Redis connection used by every BullMQ queue here.
 *   3. Register notification-queue so a worker can bind to it.
 *   4. Import NotificationsModule for the Redis-emitter publisher.
 *   5. Declare PublishProcessor — registering it starts the worker.
 *
 * Like the ai-worker, no PrismaModule: the row arrives as a value from its child.
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
    // Step 1. The publisher also reads REDIS_* through ConfigService for its own client.
    AppConfigModule,
    // Step 2. BullMQ's connection — separate from the emitter's, which uses Socket.IO's channels.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    // Step 3. Carries the single publish-summary job type.
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
    // Step 4. Exports NotificationPublisher, PublishProcessor's only dependency.
    NotificationsModule,
  ],
  // Step 5. Carries @Processor, so listing it starts the worker for notification-queue.
  providers: [PublishProcessor],
})
export class NotificationWorkerModule {}
