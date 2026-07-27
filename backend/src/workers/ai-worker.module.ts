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
    AppConfigModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    BullModule.registerQueue({ name: AI_QUEUE }),
    AiModule,
  ],
  providers: [GenerateProcessor],
})
export class AiWorkerModule {}
