import { SummaryProcessor } from './summary.processor';
import {
  JOB_FETCH,
  JOB_SAVE,
  JOB_GROUP_SUMMARY,
} from '../../queues/queue.constants';
import type { GenerateResult, PublishResult } from './stage.types';

function make() {
  const messages = {
    hasSummarySince: jest.fn().mockResolvedValue(false),
    findForSummary: jest
      .fn()
      .mockResolvedValue([
        { sender: { name: 'Ada' }, content: 'ship it', createdAt: new Date() },
      ]),
    persistAiSummary: jest.fn().mockResolvedValue({ id: 'm1', groupId: 'g1' }),
  };
  const processor = new SummaryProcessor(messages as never);
  return { processor, messages };
}

const SINCE = new Date('2026-07-24T00:00:00.000Z').toISOString();
const fetchJob = (groupId = 'g1') =>
  ({ name: JOB_FETCH, data: { groupId, since: SINCE } }) as never;
const saveJob = (child: GenerateResult) =>
  ({
    name: JOB_SAVE,
    getChildrenValues: jest
      .fn()
      .mockResolvedValue({ 'bull:ai-queue:generate-ai-summary:g1:1': child }),
  }) as never;
const groupJob = (child: PublishResult | undefined) =>
  ({
    name: JOB_GROUP_SUMMARY,
    getChildrenValues: jest
      .fn()
      .mockResolvedValue(
        child ? { 'bull:notification-queue:publish-summary:g1:1': child } : {},
      ),
  }) as never;

describe('SummaryProcessor · fetch-messages', () => {
  it('returns the window transcript', async () => {
    const { processor } = make();
    const res = await processor.process(fetchJob());
    expect(res).toEqual({
      skipped: false,
      groupId: 'g1',
      transcript: [{ sender: 'Ada', content: 'ship it' }],
    });
  });

  it('skips (exists) when a summary already exists for the window', async () => {
    const { processor, messages } = make();
    messages.hasSummarySince.mockResolvedValue(true);
    const res = await processor.process(fetchJob());
    expect(messages.findForSummary).not.toHaveBeenCalled();
    expect(res).toEqual({ skipped: true, reason: 'exists' });
  });

  it('skips (empty) when there are no messages in the window', async () => {
    const { processor, messages } = make();
    messages.findForSummary.mockResolvedValue([]);
    const res = await processor.process(fetchJob());
    expect(res).toEqual({ skipped: true, reason: 'empty' });
  });
});

describe('SummaryProcessor · save-summary', () => {
  it('persists the summary when generate produced text', async () => {
    const { processor, messages } = make();
    const res = await processor.process(
      saveJob({ skipped: false, groupId: 'g1', summaryText: 'digest' }),
    );
    expect(messages.persistAiSummary).toHaveBeenCalledWith('g1', 'digest');
    expect(res).toEqual({
      skipped: false,
      message: { id: 'm1', groupId: 'g1' },
    });
  });

  it('passes the skip up without persisting', async () => {
    const { processor, messages } = make();
    const res = await processor.process(
      saveJob({ skipped: true, reason: 'empty' }),
    );
    expect(messages.persistAiSummary).not.toHaveBeenCalled();
    expect(res).toEqual({ skipped: true });
  });
});

describe('SummaryProcessor · group-summary (parent)', () => {
  it('completes with the published flag from publish', async () => {
    const { processor } = make();
    const res = await processor.process(groupJob({ published: true }));
    expect(res).toEqual({ done: true, published: true });
  });

  it('defaults published:false when publish left no value (a skip)', async () => {
    const { processor } = make();
    const res = await processor.process(groupJob(undefined));
    expect(res).toEqual({ done: true, published: false });
  });
});
