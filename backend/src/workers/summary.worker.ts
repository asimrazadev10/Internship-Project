import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { SummaryWorkerModule } from './summary-worker.module';

async function bootstrap(): Promise<void> {
  const ctx = await NestFactory.createApplicationContext(SummaryWorkerModule);
  ctx.enableShutdownHooks();
  Logger.log('summary-worker up (queue: summary-save)', 'Worker');
}

void bootstrap();
