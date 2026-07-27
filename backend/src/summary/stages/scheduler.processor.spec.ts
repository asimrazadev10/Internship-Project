import { SchedulerProcessor } from './scheduler.processor';
import {
  JOB_SCHEDULER_TICK,
  JOB_TOKEN_PURGE,
} from '../../queues/queue.constants';

function make(groups: { id: string }[] = [{ id: 'g1' }, { id: 'g2' }]) {
  const flowAdd = jest.fn().mockResolvedValue(undefined);
  const flow = { add: flowAdd };
  const summary = { findActiveGroups: jest.fn().mockResolvedValue(groups) };
  const purgeExpired = jest.fn().mockResolvedValue(3);
  const queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
  const config = { getOrThrow: () => 86_400_000 };
  const processor = new SchedulerProcessor(
    queue as never,
    flow as never,
    summary as never,
    { purgeExpired } as never,
    config as never,
  );
  return { processor, flowAdd, summary, queue, purgeExpired };
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

  it('ignores jobs it does not own', async () => {
    const { processor, flowAdd, purgeExpired } = make();
    await processor.process({ name: 'something-else', data: {} } as never);
    expect(flowAdd).not.toHaveBeenCalled();
    expect(purgeExpired).not.toHaveBeenCalled();
  });

  it('runs the token purge on its own job, without fanning out summaries', async () => {
    const { processor, flowAdd, purgeExpired } = make();
    await processor.process({ name: JOB_TOKEN_PURGE, data: {} } as never);

    expect(purgeExpired).toHaveBeenCalledTimes(1);
    expect(flowAdd).not.toHaveBeenCalled();
  });

  // Housekeeping shares the summary queue. If a failing purge threw, BullMQ would retry it three
  // times and the queue would look broken to anyone watching summaries.
  it('does not fail the job when the purge throws', async () => {
    const { processor, purgeExpired } = make();
    purgeExpired.mockRejectedValueOnce(new Error('db down'));

    await expect(
      processor.process({ name: JOB_TOKEN_PURGE, data: {} } as never),
    ).resolves.toBeUndefined();
  });

  it('still enqueues the next group when flow.add rejects for an earlier one', async () => {
    const { processor, flowAdd } = make();
    flowAdd.mockRejectedValueOnce(new Error('redis blip'));
    await processor.process({ name: JOB_SCHEDULER_TICK, data: {} } as never);

    expect(flowAdd).toHaveBeenCalledTimes(2);
    expect(flowAdd.mock.calls[1][0].data.groupId).toBe('g2');
  });

  it('registers both repeatable jobs on bootstrap, under distinct ids', async () => {
    const { processor, queue } = make();
    await processor.onApplicationBootstrap();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'daily-summary',
      { every: 86_400_000 },
      { name: JOB_SCHEDULER_TICK, data: {} },
    );
    // A shared id would mean the second upsert silently replaced the first — one of the two
    // schedules would simply never fire, with nothing logged.
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'refresh-token-purge',
      { every: 86_400_000 },
      { name: JOB_TOKEN_PURGE, data: {} },
    );
    const ids = queue.upsertJobScheduler.mock.calls.map((c) => c[0]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
