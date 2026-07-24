// GenerateProcessor imports AiSummaryService -> the ESM-only '@ai-sdk/google'/'ai'. Mock them at
// the boundary so ts-jest's CJS transform never parses the real ESM source.
jest.mock('ai', () => ({ generateText: jest.fn() }));
jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => (model: string) => ({ model }),
}));

import { GenerateProcessor } from './generate.processor';
import type { FetchResult } from './stage.types';

function make() {
  const ai = { summarize: jest.fn().mockResolvedValue('digest') };
  const processor = new GenerateProcessor(ai as never);
  return { processor, ai };
}

// generate reads its fetch-messages child; BullMQ keys the map by "bull:<queue>:<jobId>".
const jobWith = (child: FetchResult) =>
  ({
    getChildrenValues: jest
      .fn()
      .mockResolvedValue({ 'bull:ai-queue:fetch-messages:g1:1': child }),
  }) as never;

describe('GenerateProcessor', () => {
  it('summarizes the fetched transcript', async () => {
    const { processor, ai } = make();
    const res = await processor.process(
      jobWith({
        skipped: false,
        groupId: 'g1',
        transcript: [{ sender: 'Ada', content: 'ship it' }],
      }),
    );
    expect(ai.summarize).toHaveBeenCalledWith([{ sender: 'Ada', content: 'ship it' }]);
    expect(res).toEqual({ skipped: false, groupId: 'g1', summaryText: 'digest' });
  });

  it('passes a fetch (empty) skip up without calling the model', async () => {
    const { processor, ai } = make();
    const res = await processor.process(jobWith({ skipped: true, reason: 'empty' }));
    expect(ai.summarize).not.toHaveBeenCalled();
    expect(res).toEqual({ skipped: true, reason: 'empty' });
  });

  it('passes a fetch (exists) skip up too', async () => {
    const { processor } = make();
    const res = await processor.process(jobWith({ skipped: true, reason: 'exists' }));
    expect(res).toEqual({ skipped: true, reason: 'exists' });
  });

  it('skips (blank) when the model returns nothing', async () => {
    const { processor, ai } = make();
    ai.summarize.mockResolvedValue('');
    const res = await processor.process(
      jobWith({ skipped: false, groupId: 'g1', transcript: [{ sender: 'Ada', content: 'x' }] }),
    );
    expect(res).toEqual({ skipped: true, reason: 'blank' });
  });
});
