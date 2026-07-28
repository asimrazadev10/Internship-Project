/**
 * HOW THIS FILE WORKS
 *   1. Load .env before anything else is imported.
 *   2. Build the SummaryWorkerModule graph as a context with no HTTP server.
 *   3. Register shutdown hooks so an in-flight job finishes on SIGTERM.
 *   4. Log the readiness line for summary-queue.
 *
 * The busiest worker: summary-queue carries three of the five pipeline jobs.
 */

// Load .env BEFORE the module graph so the @Processor concurrency option (which reads process.env
// at import time, before ConfigModule loads .env) sees the configured value.
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { SummaryWorkerModule } from './summary-worker.module';

async function bootstrap(): Promise<void> {
  // Step 2. No HTTP adapter — this process only consumes jobs.
  const ctx = await NestFactory.createApplicationContext(SummaryWorkerModule);
  // Step 3. Stops a killed save-summary dropping a summary that already cost a Gemini call.
  ctx.enableShutdownHooks();
  // Step 4. The line to look for in `npm run workers:all` output.
  Logger.log('summary-worker up (queue: summary-queue)', 'Worker');
}

// `void` marks the floating promise as deliberate for eslint.
void bootstrap();
