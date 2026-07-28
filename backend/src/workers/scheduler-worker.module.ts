/**
 * HOW THIS FILE WORKS
 *   1. Import AppConfigModule for ConfigService and the validated env.
 *   2. Import PrismaModule — the tick queries Postgres for active groups.
 *   3. Open the shared Redis connection used by every BullMQ queue here.
 *   4. Register scheduler-queue, the queue this worker drains.
 *   5. Register the summary-flow FlowProducer, which lets the tick add whole job trees.
 *   6. Import RefreshTokenPurgeModule for the second repeatable on the same queue.
 *   7. Declare SchedulerProcessor and SummaryService.
 *
 * The only worker that registers a FlowProducer, because it creates flows rather than consuming
 * a stage of one.
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { RefreshTokenPurgeModule } from '../auth/refresh-token-purge.module';
import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { bullConnectionFactory } from '../config/redis.config';
import { SCHEDULER_QUEUE, SUMMARY_FLOW } from '../queues/queue.constants';
import { SchedulerProcessor } from '../summary/stages/scheduler.processor';
import { SummaryService } from '../summary/summary.service';

@Module({
  imports: [
    // Step 1. ConfigService, plus the env validation that runs at boot.
    AppConfigModule,
    // Step 2. Needed by findActiveGroups and by the token purge.
    PrismaModule,
    // Step 3. Same factory as the other workers, so connection settings cannot drift.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    // Step 4. Also gives this module a Queue to call upsertJobScheduler on.
    BullModule.registerQueue({ name: SCHEDULER_QUEUE }),
    // Step 5. A FlowProducer adds a parent/child tree atomically; a plain Queue cannot.
    BullModule.registerFlowProducer({ name: SUMMARY_FLOW }),
    // Step 6. Housekeeping rides on this queue rather than adding a second scheduler mechanism.
    RefreshTokenPurgeModule,
  ],
  // Step 7. SchedulerProcessor carries @Processor, so listing it starts the worker.
  providers: [SchedulerProcessor, SummaryService],
})
export class SchedulerWorkerModule {}
