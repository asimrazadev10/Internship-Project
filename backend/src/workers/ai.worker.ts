/**
 * HOW THIS FILE WORKS
 *
 *   1. Load .env into process.env — before any other import is evaluated.
 *   2. Build the AiWorkerModule dependency graph as a context with NO HTTP server.
 *   3. Register shutdown hooks so an in-flight job finishes instead of being dropped.
 *   4. Log the readiness line that tells you the worker is draining ai-queue.
 *
 * One of four standalone worker entry points (scheduler / ai / summary / notification). Each is
 * its own OS process draining its own queue; none of them listens on a port. This one runs the
 * generate-ai-summary stage, which is pure AI — see ai-worker.module.ts for why it needs no
 * database access at all.
 */

// Step 1. Load .env BEFORE the module graph so the @Processor concurrency option (which reads
// process.env at import time, before ConfigModule loads .env) sees the configured value.
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AiWorkerModule } from './ai-worker.module';

async function bootstrap(): Promise<void> {
  // Step 2. createApplicationContext — NOT create() — instantiates the providers without an HTTP
  // adapter, so this process resolves the DI graph and then only consumes jobs.
  const ctx = await NestFactory.createApplicationContext(AiWorkerModule);
  // Step 3. On SIGTERM/SIGINT Nest runs the destroy hooks; BullMQ uses them to stop taking new
  // jobs and let the current one finish, rather than dying mid-Gemini-call.
  ctx.enableShutdownHooks();
  // Step 4. The line to look for in `npm run workers:all` output to confirm this worker is live.
  Logger.log('ai-worker up (queue: ai-queue)', 'Worker');
}

// Kick off the async bootstrap. `void` marks the floating promise as deliberate, which is what
// keeps eslint's no-floating-promises rule quiet on a top-level fire-and-forget call.
void bootstrap();
