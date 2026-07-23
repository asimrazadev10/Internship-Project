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

import { JOB_GROUP_SUMMARY as GS } from './summary.constants';

describe('SummaryProcessor — group-summary job', () => {
  function make() {
    const messages = {
      hasSummarySince: jest.fn().mockResolvedValue(false),
      findForSummary: jest.fn().mockResolvedValue([
        { sender: { name: 'Ada' }, content: 'ship it', createdAt: new Date() },
      ]),
      createAiSummary: jest.fn().mockResolvedValue({ id: 's1' }),
    };
    const ai = { summarize: jest.fn().mockResolvedValue('digest') };
    const processor = new SummaryProcessor(
      { add: jest.fn() } as never,
      { findActiveGroups: jest.fn() } as never,
      messages as never,
      ai as never,
      { getOrThrow: () => 86_400_000 } as never,
    );
    return { processor, messages, ai };
  }

  it('summarizes and posts an AI_SUMMARY for an active group', async () => {
    const { processor, messages, ai } = make();
    await processor.process({ name: GS, data: { groupId: 'g1' } } as never);

    expect(ai.summarize).toHaveBeenCalledWith([{ sender: 'Ada', content: 'ship it' }]);
    expect(messages.createAiSummary).toHaveBeenCalledWith('g1', 'digest');
  });

  it('skips when a summary already exists for the window', async () => {
    const { processor, messages, ai } = make();
    messages.hasSummarySince.mockResolvedValue(true);
    await processor.process({ name: GS, data: { groupId: 'g1' } } as never);

    expect(ai.summarize).not.toHaveBeenCalled();
    expect(messages.createAiSummary).not.toHaveBeenCalled();
  });

  it('skips when there are no messages in the window', async () => {
    const { processor, messages, ai } = make();
    messages.findForSummary.mockResolvedValue([]);
    await processor.process({ name: GS, data: { groupId: 'g1' } } as never);

    expect(ai.summarize).not.toHaveBeenCalled();
    expect(messages.createAiSummary).not.toHaveBeenCalled();
  });
});
