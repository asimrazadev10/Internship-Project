/**
 * HOW THIS FILE WORKS
 *
 *   1. Import AppConfigModule for ConfigService and the validated env.
 *   2. Import PrismaModule — the tick queries Postgres for active groups.
 *   3. Open the shared Redis connection used by every BullMQ queue in this process.
 *   4. Register scheduler-queue, the queue this worker drains.
 *   5. Register the summary-flow FlowProducer, which is what lets the tick ADD whole job trees.
 *   6. Import RefreshTokenPurgeModule for the second repeatable job on the same queue.
 *   7. Declare SchedulerProcessor (starts the worker) and SummaryService (its group query).
 *
 * The DI graph for the scheduler-worker process. It is the only worker that registers a
 * FlowProducer, because it is the only one that CREATES flows rather than consuming a stage.
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
    // Step 2. Needed by SummaryService.findActiveGroups and by the token purge.
    PrismaModule,
    // Step 3. Same factory the other workers and the main app use, so connection settings for
    // host/port/password cannot drift between processes.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    // Step 4. Registering the queue gives the processor something to bind to, and gives this
    // module a Queue instance to call upsertJobScheduler on.
    BullModule.registerQueue({ name: SCHEDULER_QUEUE }),
    // Step 5. A FlowProducer adds a parent/child TREE atomically. A plain Queue can only add flat
    // jobs, which could not express the five-stage chain or its dependency ordering.
    BullModule.registerFlowProducer({ name: SUMMARY_FLOW }),
    // Step 6. Supplies RefreshTokenPurgeService — unrelated to summaries, but it rides on this
    // same queue as a second repeatable rather than introducing a parallel scheduling mechanism.
    RefreshTokenPurgeModule,
  ],
  // Step 7. SchedulerProcessor carries @Processor, so listing it here is what starts the worker
  // and triggers its onApplicationBootstrap scheduler registration.
  providers: [SchedulerProcessor, SummaryService],
})
export class SchedulerWorkerModule {}
