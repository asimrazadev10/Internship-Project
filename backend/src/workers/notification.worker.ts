/**
 * HOW THIS FILE WORKS
 *   1. Load .env before anything else is imported.
 *   2. Build the NotificationWorkerModule graph as a context with no HTTP server.
 *   3. Register shutdown hooks so an in-flight broadcast finishes on SIGTERM.
 *   4. Log the readiness line for notification-queue.
 *
 * The last stage. Has no Socket.IO server of its own — it publishes to the Redis channels the
 * main API's adapter is already subscribed to.
 */

// Load .env BEFORE the module graph so the @Processor concurrency option (which reads process.env
// at import time, before ConfigModule loads .env) sees the configured value.
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { NotificationWorkerModule } from './notification-worker.module';

async function bootstrap(): Promise<void> {
  // Step 2. No HTTP adapter — this process only consumes jobs and emits to Redis.
  const ctx = await NestFactory.createApplicationContext(
    NotificationWorkerModule,
  );
  // Step 3. Also closes the publisher's ioredis connection via onModuleDestroy.
  ctx.enableShutdownHooks();
  // Step 4. The publisher's own "redis emitter ready" line sits beside this one.
  Logger.log('notification-worker up (queue: notification-queue)', 'Worker');
}

// `void` marks the floating promise as deliberate for eslint.
void bootstrap();
