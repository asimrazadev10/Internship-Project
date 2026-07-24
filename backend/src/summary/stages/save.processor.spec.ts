import { SaveProcessor } from './save.processor';
import type { GenerateResult } from './stage.types';

function make() {
  const messages = {
    persistAiSummary: jest.fn().mockResolvedValue({ id: 'm1', groupId: 'g1' }),
  };
  const processor = new SaveProcessor(messages as never);
  return { processor, messages };
}

// One child on the generate queue; BullMQ keys the map by "bull:<queue>:<jobId>".
const jobWith = (child: GenerateResult) =>
  ({
    getChildrenValues: jest
      .fn()
      .mockResolvedValue({ 'bull:summary-generate:generate-ai-summary:g1:1': child }),
  }) as never;

describe('SaveProcessor', () => {
  it('persists the summary when generate produced text', async () => {
    const { processor, messages } = make();
    const res = await processor.process(
      jobWith({ skipped: false, groupId: 'g1', summaryText: 'digest' }),
    );
    expect(messages.persistAiSummary).toHaveBeenCalledWith('g1', 'digest');
    expect(res).toEqual({ skipped: false, message: { id: 'm1', groupId: 'g1' } });
  });

  it('passes the skip up without persisting', async () => {
    const { processor, messages } = make();
    const res = await processor.process(jobWith({ skipped: true, reason: 'empty' }));
    expect(messages.persistAiSummary).not.toHaveBeenCalled();
    expect(res).toEqual({ skipped: true });
  });
});
