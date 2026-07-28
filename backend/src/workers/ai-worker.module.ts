/**
 * HOW THIS FILE WORKS
 *   1. Import AppConfigModule for ConfigService and the validated env.
 *   2. Open the shared Redis connection used by every BullMQ queue here.
 *   3. Register ai-queue so a worker can bind to it.
 *   4. Import AiModule for the Gemini wrapper.
 *   5. Declare GenerateProcessor — registering it starts the worker.
 *
 * The leanest of the four worker modules: no Prisma, no EventEmitter.
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
    // Step 2. Built from ConfigService, so settings match the other workers exactly.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    // Step 3. Nest needs the queue registered before a @Processor can bind to it.
    BullModule.registerQueue({ name: AI_QUEUE }),
    // Step 4. Exports AiSummaryService, GenerateProcessor's only dependency.
    AiModule,
  ],
  // Step 5. @nestjs/bullmq turns an @Processor provider into a running BullMQ Worker.
  providers: [GenerateProcessor],
})
export class AiWorkerModule {}
