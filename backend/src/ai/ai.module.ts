/**
 * HOW THIS FILE WORKS
 *   1. Provide AiSummaryService.
 *   2. Export it so the ai-worker can inject it.
 */
import { Module } from '@nestjs/common';

import { AiSummaryService } from './ai-summary.service';

@Module({
  // Step 1. One instance per process that imports this module.
  providers: [AiSummaryService],
  // Step 2. Without this export, AiWorkerModule could not inject it.
  exports: [AiSummaryService],
})
export class AiModule {}
