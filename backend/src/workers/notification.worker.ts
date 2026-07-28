/**
 * HOW THIS FILE WORKS
 *
 *   1. Load .env into process.env — before any other import is evaluated.
 *   2. Build the NotificationWorkerModule graph as a context with NO HTTP server.
 *   3. Register shutdown hooks so an in-flight broadcast finishes instead of being dropped.
 *   4. Log the readiness line for notification-queue.
 *
 * The last stage of the Flow. This process has no Socket.IO server of its own — it reaches
 * connected browsers by publishing to the same Redis channels the main API's redis-adapter is
 * already subscribed to. See notification.publisher.ts for how that works.
 */

// Step 1. Load .env BEFORE the module graph so the @Processor concurrency option, which reads
// process.env at import time, sees the configured value rather than its fallback.
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { NotificationWorkerModule } from './notification-worker.module';

async function bootstrap(): Promise<void> {
  // Step 2. No HTTP adapter — this process only consumes jobs and emits to Redis.
  const ctx = await NestFactory.createApplicationContext(
    NotificationWorkerModule,
  );
  // Step 3. Also closes the publisher's ioredis connection cleanly via onModuleDestroy, so the
  // shared Redis does not accumulate dead clients across restarts.
  ctx.enableShutdownHooks();
  // Step 4. Readiness line; the publisher's own "redis emitter ready" line sits beside it.
  Logger.log('notification-worker up (queue: notification-queue)', 'Worker');
}

// Kick off the async bootstrap. `void` marks the floating promise as deliberate for eslint.
void bootstrap();
