import { SchedulerProcessor } from './scheduler.processor';
import { JOB_SCHEDULER_TICK } from '../../queues/queue.constants';

function make(groups: { id: string }[] = [{ id: 'g1' }, { id: 'g2' }]) {
  const flowAdd = jest.fn().mockResolvedValue(undefined);
  const flow = { add: flowAdd };
  const summary = { findActiveGroups: jest.fn().mockResolvedValue(groups) };
  const queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
  const config = { getOrThrow: () => 86_400_000 };
  const processor = new SchedulerProcessor(
    queue as never,
    flow as never,
    summary as never,
    config as never,
  );
  return { processor, flowAdd, summary, queue };
}

describe('SchedulerProcessor', () => {
  it('adds one summary flow per active group, rooted at the group-summary parent', async () => {
    const { processor, flowAdd } = make();
    await processor.process({ name: JOB_SCHEDULER_TICK, data: {} } as never);

    expect(flowAdd).toHaveBeenCalledTimes(2);
    const flow = flowAdd.mock.calls[0][0];
    expect(flow.name).toBe('group-summary');
    expect(flow.queueName).toBe('summary-queue');
    expect(flow.data.groupId).toBe('g1');
    // group-summary → publish → save → generate → fetch (leaf)
    const fetch = flow.children[0].children[0].children[0].children[0];
    expect(fetch.name).toBe('fetch-messages');
    expect(fetch.data.groupId).toBe('g1');
  });

  it('ignores non-tick jobs', async () => {
    const { processor, flowAdd } = make();
    await processor.process({ name: 'something-else', data: {} } as never);
    expect(flowAdd).not.toHaveBeenCalled();
  });

  it('still enqueues the next group when flow.add rejects for an earlier one', async () => {
    const { processor, flowAdd } = make();
    flowAdd.mockRejectedValueOnce(new Error('redis blip'));
    await processor.process({ name: JOB_SCHEDULER_TICK, data: {} } as never);

    expect(flowAdd).toHaveBeenCalledTimes(2);
    expect(flowAdd.mock.calls[1][0].data.groupId).toBe('g2');
  });

  it('registers the repeatable scheduler on bootstrap', async () => {
    const { processor, queue } = make();
    await processor.onApplicationBootstrap();
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'daily-summary',
      { every: 86_400_000 },
      { name: JOB_SCHEDULER_TICK, data: {} },
    );
  });
});
