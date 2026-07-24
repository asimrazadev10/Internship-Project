import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { NotificationWorkerModule } from './notification-worker.module';

async function bootstrap(): Promise<void> {
  const ctx = await NestFactory.createApplicationContext(NotificationWorkerModule);
  ctx.enableShutdownHooks();
  Logger.log('notification-worker up (queue: summary-publish)', 'Worker');
}

void bootstrap();
