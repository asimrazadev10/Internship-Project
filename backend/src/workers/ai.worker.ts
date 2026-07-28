/**
 * HOW THIS FILE WORKS
 *   1. Load .env before anything else is imported.
 *   2. Build the AiWorkerModule graph as a context with no HTTP server.
 *   3. Register shutdown hooks so an in-flight job finishes on SIGTERM.
 *   4. Log the readiness line for ai-queue.
 *
 * One of four standalone worker processes; runs the generate-ai-summary stage.
 */

// Load .env BEFORE the module graph so the @Processor concurrency option (which reads process.env
// at import time, before ConfigModule loads .env) sees the configured value.
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AiWorkerModule } from './ai-worker.module';

async function bootstrap(): Promise<void> {
  // Step 2. createApplicationContext, not create() — no HTTP adapter, just the DI graph.
  const ctx = await NestFactory.createApplicationContext(AiWorkerModule);
  // Step 3. Lets BullMQ finish the current job instead of dying mid-Gemini-call.
  ctx.enableShutdownHooks();
  // Step 4. The line to look for in `npm run workers:all` output.
  Logger.log('ai-worker up (queue: ai-queue)', 'Worker');
}

// `void` marks the floating promise as deliberate for eslint.
void bootstrap();
