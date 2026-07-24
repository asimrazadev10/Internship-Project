// Load .env BEFORE the module graph so the @Processor concurrency option (which reads process.env
// at import time, before ConfigModule loads .env) sees the configured value.
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AiWorkerModule } from './ai-worker.module';

async function bootstrap(): Promise<void> {
  const ctx = await NestFactory.createApplicationContext(AiWorkerModule);
  ctx.enableShutdownHooks();
  Logger.log('ai-worker up (queue: summary-generate)', 'Worker');
}

void bootstrap();
