/**
 * HOW THIS FILE WORKS
 *   1. Load .env before anything else is imported.
 *   2. Build the SchedulerWorkerModule graph as a context with no HTTP server.
 *   3. Register shutdown hooks so an in-flight tick finishes on SIGTERM.
 *   4. Log the readiness line for scheduler-queue.
 *
 * The clock of the system: it creates flows rather than processing a stage. Stop this process and
 * no summaries are ever scheduled.
 */

// Load .env BEFORE the module graph so the @Processor concurrency option (which reads process.env
// at import time, before ConfigModule loads .env) sees the configured value.
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { SchedulerWorkerModule } from './scheduler-worker.module';

async function bootstrap(): Promise<void> {
  // Step 2. Building the context also fires onApplicationBootstrap, which registers the schedulers.
  const ctx = await NestFactory.createApplicationContext(SchedulerWorkerModule);
  // Step 3. Lets a tick finish rather than abandoning a half-finished fan-out.
  ctx.enableShutdownHooks();
  // Step 4. The scheduler registration lines follow this one in the log.
  Logger.log('scheduler-worker up (queue: scheduler-queue)', 'Worker');
}

// `void` marks the floating promise as deliberate for eslint.
void bootstrap();
