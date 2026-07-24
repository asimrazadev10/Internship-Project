import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { AiSummaryService } from '../../ai/ai-summary.service';
import { MessagesService } from '../../messages/messages.service';
import { AI_QUEUE, concurrencyFromEnv } from '../../queues/queue.constants';
import type { GenerateResult } from './stage.types';

/**
 * Stage 1 (leaf): decide whether there is anything to summarize and, if so, produce the text. All
 * skip logic lives here; the reason is returned so the parents can no-op cleanly. A thrown Gemini
 * error retries only this child (attempts/backoff) and, on final failure, fails the whole flow.
 */
@Processor(AI_QUEUE, { concurrency: concurrencyFromEnv('AI_WORKER_CONCURRENCY', 2) })
export class GenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateProcessor.name);

  constructor(
    private readonly messages: MessagesService,
    private readonly ai: AiSummaryService,
  ) {
    super();
  }

  async process(job: Job<{ groupId: string; since: string }>): Promise<GenerateResult> {
    const { groupId } = job.data;
    const since = new Date(job.data.since);

    if (await this.messages.hasSummarySince(groupId, since)) {
      return { skipped: true, reason: 'exists' };
    }

    const rows = await this.messages.findForSummary(groupId, since);
    if (rows.length === 0) return { skipped: true, reason: 'empty' };

    const transcript = rows.map((r) => ({
      sender: r.sender?.name ?? 'Unknown',
      content: r.content,
    }));
    const summaryText = await this.ai.summarize(transcript);
    if (!summaryText) return { skipped: true, reason: 'blank' };

    this.logger.log(`group ${groupId}: summary generated`);
    return { skipped: false, groupId, summaryText };
  }
}
