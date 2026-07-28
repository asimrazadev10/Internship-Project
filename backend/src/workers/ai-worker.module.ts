/**
 * HOW THIS FILE WORKS
 *
 *   1. Import AppConfigModule so ConfigService (and env validation) is available.
 *   2. Open the shared Redis connection that every BullMQ queue in this process uses.
 *   3. Register ai-queue, so this process can attach a worker to it.
 *   4. Import AiModule, which supplies the Gemini wrapper the stage depends on.
 *   5. Declare GenerateProcessor as a provider — registering it IS what starts the worker.
 *
 * The DI graph for the ai-worker process. What is ABSENT is the point: no PrismaModule, no
 * MessagesModule, no EventEmitter. This is the leanest of the four worker modules.
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '../config/config.module';
import { AiModule } from '../ai/ai.module';
import { bullConnectionFactory } from '../config/redis.config';
import { AI_QUEUE } from '../queues/queue.constants';
import { GenerateProcessor } from '../summary/stages/generate.processor';

// The generate stage is PURE AI — it reads the transcript from its fetch-messages child and calls
// Gemini, touching no database. So the ai-worker needs only config + Bull + the AI SDK wrapper; no
// Prisma, MessagesModule, or EventEmitter.
@Module({
  imports: [
    // Step 1. Provides ConfigService; also where the env schema is validated on boot.
    AppConfigModule,
    // Step 2. forRootAsync so the connection is built from ConfigService rather than literals —
    // bullConnectionFactory is shared with the other three workers and the main app.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    // Step 3. Registers the queue by name. Nest needs this before a @Processor can bind to it.
    BullModule.registerQueue({ name: AI_QUEUE }),
    // Step 4. Exports AiSummaryService, GenerateProcessor's only constructor dependency.
    AiModule,
  ],
  // Step 5. @nestjs/bullmq turns a provider carrying @Processor into a running BullMQ Worker, so
  // this one line is what actually makes the process start draining ai-queue.
  providers: [GenerateProcessor],
})
export class AiWorkerModule {}
