/**
 * HOW THIS FILE WORKS
 *
 *   1. Load .env into process.env — before any other import is evaluated.
 *   2. Build the SummaryWorkerModule graph as a context with NO HTTP server.
 *   3. Register shutdown hooks so an in-flight job finishes instead of being dropped.
 *   4. Log the readiness line for summary-queue.
 *
 * The busiest of the four workers: summary-queue carries THREE of the pipeline's five jobs
 * (fetch-messages, save-summary, and the group-summary parent), all dispatched by job name inside
 * SummaryProcessor. It is also the only worker besides the scheduler that talks to Postgres.
 */

// Step 1. Load .env BEFORE the module graph so the @Processor concurrency option, which reads
// process.env at import time, sees the configured value rather than its fallback.
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { SummaryWorkerModule } from './summary-worker.module';

async function bootstrap(): Promise<void> {
  // Step 2. No HTTP adapter — this process only consumes jobs.
  const ctx = await NestFactory.createApplicationContext(SummaryWorkerModule);
  // Step 3. Matters most here: a killed save-summary could otherwise drop a generated summary
  // that already cost a Gemini call.
  ctx.enableShutdownHooks();
  // Step 4. Readiness line to look for in `npm run workers:all` output.
  Logger.log('summary-worker up (queue: summary-queue)', 'Worker');
}

// Kick off the async bootstrap. `void` marks the floating promise as deliberate for eslint.
void bootstrap();
