// GenerateProcessor imports AiSummaryService -> the ESM-only '@ai-sdk/google'/'ai'. Mock them at
// the boundary so ts-jest's CJS transform never parses the real ESM source.
jest.mock('ai', () => ({ generateText: jest.fn() }));
jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => (model: string) => ({ model }),
}));

import { Job } from 'bullmq';

import { GenerateProcessor } from './generate.processor';

const SINCE = new Date('2026-07-24T00:00:00.000Z').toISOString();
const job = (groupId = 'g1') =>
  ({ data: { groupId, since: SINCE } }) as Job<{ groupId: string; since: string }>;

function make() {
  const messages = {
    hasSummarySince: jest.fn().mockResolvedValue(false),
    findForSummary: jest.fn().mockResolvedValue([
      { sender: { name: 'Ada' }, content: 'ship it', createdAt: new Date() },
    ]),
  };
  const ai = { summarize: jest.fn().mockResolvedValue('digest') };
  const processor = new GenerateProcessor(messages as never, ai as never);
  return { processor, messages, ai };
}

describe('GenerateProcessor', () => {
  it('returns the summary text for an active group', async () => {
    const { processor, ai } = make();
    const res = await processor.process(job());
    expect(ai.summarize).toHaveBeenCalledWith([{ sender: 'Ada', content: 'ship it' }]);
    expect(res).toEqual({ skipped: false, groupId: 'g1', summaryText: 'digest' });
  });

  it('skips (exists) when a summary already exists for the window', async () => {
    const { processor, messages, ai } = make();
    messages.hasSummarySince.mockResolvedValue(true);
    const res = await processor.process(job());
    expect(ai.summarize).not.toHaveBeenCalled();
    expect(res).toEqual({ skipped: true, reason: 'exists' });
  });

  it('skips (empty) when there are no messages in the window', async () => {
    const { processor, messages, ai } = make();
    messages.findForSummary.mockResolvedValue([]);
    const res = await processor.process(job());
    expect(ai.summarize).not.toHaveBeenCalled();
    expect(res).toEqual({ skipped: true, reason: 'empty' });
  });

  it('skips (blank) when the model returns nothing', async () => {
    const { processor, ai } = make();
    ai.summarize.mockResolvedValue('');
    const res = await processor.process(job());
    expect(res).toEqual({ skipped: true, reason: 'blank' });
  });
});
