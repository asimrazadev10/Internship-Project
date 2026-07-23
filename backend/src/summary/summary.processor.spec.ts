import { Job } from 'bullmq';

// SummaryProcessor imports AiSummaryService, which imports the ESM-only '@ai-sdk/google' package.
// Mock the vendor modules at the boundary (same pattern as ai-summary.service.spec.ts) so Jest's
// CJS transform never has to touch them — the test injects its own `ai` mock below anyway.
jest.mock('ai', () => ({ generateText: jest.fn() }));
jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => (model: string) => ({ model }),
}));

import { SummaryProcessor } from './summary.processor';
import { JOB_SCHEDULER, JOB_GROUP_SUMMARY } from './summary.constants';

function makeProcessor(overrides: Partial<Record<string, unknown>> = {}) {
  const add = jest.fn().mockResolvedValue(undefined);
  const queue = { add } as never;
  const summaryService = {
    findActiveGroups: jest.fn().mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]),
  };
  const messages = { findForSummary: jest.fn(), createAiSummary: jest.fn(), hasSummarySince: jest.fn() };
  const ai = { summarize: jest.fn() };
  const config = { getOrThrow: () => 86_400_000 };
  const processor = new SummaryProcessor(
    queue,
    summaryService as never,
    messages as never,
    ai as never,
    config as never,
  );
  return { processor, add, summaryService, ...overrides };
}

describe('SummaryProcessor — scheduler job', () => {
  it('enqueues one group-summary job per active group with a deterministic jobId', async () => {
    const { processor, add } = makeProcessor();
    await processor.process({ name: JOB_SCHEDULER, data: {} } as Job);

    expect(add).toHaveBeenCalledTimes(2);
    const [name, data, opts] = add.mock.calls[0];
    expect(name).toBe(JOB_GROUP_SUMMARY);
    expect(data).toEqual({ groupId: 'g1' });
    expect(opts.jobId).toMatch(/^gs:g1:\d+$/);
    expect(opts.attempts).toBe(3);
    expect(opts.backoff).toEqual({ type: 'exponential', delay: 2000 });
  });
});
