/**
 * HOW THIS FILE WORKS
 *
 *   1. Import AppConfigModule for ConfigService and the validated env.
 *   2. Import PrismaModule — two of this worker's three jobs read or write Postgres.
 *   3. Open the shared Redis connection used by every BullMQ queue in this process.
 *   4. Register summary-queue, the queue this worker drains.
 *   5. Import SummaryMessagesModule for the three message queries the stages need.
 *   6. Declare SummaryProcessor — registering it IS what starts the worker.
 *
 * The DI graph for the summary-worker process, which handles three of the pipeline's five jobs.
 * The choice of SummaryMessagesModule over MessagesModule in step 5 is the interesting decision;
 * the docblock below records why.
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SummaryMessagesModule } from '../messages/summary-messages.module';
import { bullConnectionFactory } from '../config/redis.config';
import { SUMMARY_QUEUE } from '../queues/queue.constants';
import { SummaryProcessor } from '../summary/stages/summary.processor';

/**
 * The summary-worker drains summary-queue, handling three jobs (fetch-messages, save-summary, and
 * the group-summary parent) via SummaryProcessor.
 *
 * Imports SummaryMessagesModule rather than MessagesModule: this process needs three Prisma
 * queries — not the HTTP controllers, StorageModule, GroupsModule, or the EventEmitter2 that
 * MessagesService depends on. EventEmitterModule.forRoot() used to be listed here purely to
 * satisfy that unused dependency, with a comment apologising for it. Both are now gone.
 */
@Module({
  imports: [
    // Step 1. ConfigService, plus the env validation that runs at boot.
    AppConfigModule,
    // Step 2. SummaryMessagesService depends on PrismaService alone.
    PrismaModule,
    // Step 3. The shared connection factory, identical across all four workers.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    // Step 4. One queue, three job names — SummaryProcessor dispatches between them.
    BullModule.registerQueue({ name: SUMMARY_QUEUE }),
    // Step 5. The narrow module: hasSummarySince, findForSummary, persistAiSummary and nothing
    // else. See the docblock above for what importing MessagesModule instead would drag in.
    SummaryMessagesModule,
  ],
  // Step 6. Carries @Processor, so listing it here starts the BullMQ worker for summary-queue.
  providers: [SummaryProcessor],
})
export class SummaryWorkerModule {}
