import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { SchedulerWorkerModule } from './scheduler-worker.module';

async function bootstrap(): Promise<void> {
  const ctx = await NestFactory.createApplicationContext(SchedulerWorkerModule);
  ctx.enableShutdownHooks();
  Logger.log('scheduler-worker up (queue: scheduler-queue)', 'Worker');
}

void bootstrap();
