/**
 * HOW THIS FILE WORKS
 *   1. Import AppConfigModule for ConfigService and the validated env.
 *   2. Import DatabaseModule — two of the three jobs read or write MongoDB.
 *   3. Open the shared Redis connection used by every BullMQ queue here.
 *   4. Register summary-queue, the queue this worker drains.
 *   5. Import SummaryMessagesModule for the three message queries.
 *   6. Declare SummaryProcessor — registering it starts the worker.
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../common/database/database.module';
import { SummaryMessagesModule } from '../messages/summary-messages.module';
import { bullConnectionFactory } from '../config/redis.config';
import { SUMMARY_QUEUE } from '../queues/queue.constants';
import { SummaryProcessor } from '../summary/stages/summary.processor';

/**
 * The summary-worker drains summary-queue, handling three jobs (fetch-messages, save-summary, and
 * the group-summary parent) via SummaryProcessor.
 *
 * Imports SummaryMessagesModule rather than MessagesModule: this process needs three MongoDB
 * queries — not the HTTP controllers, StorageModule, GroupsModule, or the EventEmitter2 that
 * MessagesService depends on.
 */
@Module({
  imports: [
    // Step 1. ConfigService, plus the env validation that runs at boot.
    AppConfigModule,
    // Step 2. SummaryMessagesService depends on DatabaseModule alone.
    DatabaseModule,
    // Step 3. The shared connection factory, identical across all four workers.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    // Step 4. One queue, three job names — SummaryProcessor dispatches between them.
    BullModule.registerQueue({ name: SUMMARY_QUEUE }),
    // Step 5. The narrow module; see the docblock above for what MessagesModule would drag in.
    SummaryMessagesModule,
  ],
  // Step 6. Carries @Processor, so listing it starts the worker for summary-queue.
  providers: [SummaryProcessor],
})
export class SummaryWorkerModule {}
