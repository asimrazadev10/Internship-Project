/**
 * HOW THIS FILE WORKS
 *
 *   1. Load .env into process.env — before any other import is evaluated.
 *   2. Build the SchedulerWorkerModule graph as a context with NO HTTP server.
 *   3. Register shutdown hooks so an in-flight tick finishes instead of being dropped.
 *   4. Log the readiness line for scheduler-queue.
 *
 * The clock of the whole system. Unlike the other three workers this one does not process a stage
 * of the Flow — on boot its processor registers two repeatable jobs (the summary tick and the
 * refresh-token purge), and on each tick it fans out one Flow per active group. Stop this process
 * and no summaries are ever scheduled, though the other workers keep draining what already exists.
 */

// Step 1. Load .env BEFORE the module graph: the @Processor concurrency option reads process.env
// at import time, before ConfigModule has had a chance to load the file.
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { SchedulerWorkerModule } from './scheduler-worker.module';

async function bootstrap(): Promise<void> {
  // Step 2. createApplicationContext — NOT create() — resolves providers with no HTTP adapter.
  // Building the context is also what triggers SchedulerProcessor.onApplicationBootstrap, which
  // is where the two repeatable schedulers get registered.
  const ctx = await NestFactory.createApplicationContext(SchedulerWorkerModule);
  // Step 3. Lets BullMQ finish the tick it is holding on SIGTERM rather than abandoning a
  // half-finished fan-out.
  ctx.enableShutdownHooks();
  // Step 4. Readiness line; the scheduler registration lines follow it in the log.
  Logger.log('scheduler-worker up (queue: scheduler-queue)', 'Worker');
}

// Kick off the async bootstrap. `void` marks the floating promise as deliberate for eslint.
void bootstrap();
