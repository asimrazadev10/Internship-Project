import {
  buildSummaryFlow,
  AI_QUEUE,
  SUMMARY_QUEUE,
  NOTIFICATION_QUEUE,
  JOB_GROUP_SUMMARY,
  JOB_GENERATE,
  JOB_SAVE,
  JOB_PUBLISH,
  JOB_FETCH,
  intFromEnv,
  firstChildValue,
} from './queue.constants';

describe('buildSummaryFlow', () => {
  const since = new Date('2026-07-24T00:00:00.000Z');
  const bucket = 1_700_000_000_000;
  const flow = buildSummaryFlow('g1', since, bucket);
  const publish = flow.children![0];
  const save = publish.children![0];
  const generate = save.children![0];
  const fetch = generate.children![0];

  it('roots at group-summary on the summary queue (the parent)', () => {
    expect(flow.name).toBe(JOB_GROUP_SUMMARY);
    expect(flow.queueName).toBe(SUMMARY_QUEUE);
    expect(flow.data).toEqual({ groupId: 'g1' });
    expect(flow.opts?.jobId).toBe(`${JOB_GROUP_SUMMARY}:g1:${bucket}`);
  });

  it('nests publish → save → generate under it, each failing the parent on failure', () => {
    expect(publish.name).toBe(JOB_PUBLISH);
    expect(publish.queueName).toBe(NOTIFICATION_QUEUE);
    expect(publish.opts?.failParentOnFailure).toBe(true);

    expect(save.name).toBe(JOB_SAVE);
    expect(save.queueName).toBe(SUMMARY_QUEUE);
    expect(save.opts?.failParentOnFailure).toBe(true);

    expect(generate.name).toBe(JOB_GENERATE);
    expect(generate.queueName).toBe(AI_QUEUE);
    expect(generate.data).toEqual({ groupId: 'g1' });
    expect(generate.opts?.failParentOnFailure).toBe(true);
  });

  it('has fetch-messages as the leaf, carrying the ISO window', () => {
    expect(fetch.name).toBe(JOB_FETCH);
    expect(fetch.queueName).toBe(SUMMARY_QUEUE);
    expect(fetch.data).toEqual({ groupId: 'g1', since: since.toISOString() });
    expect(fetch.opts?.jobId).toBe(`${JOB_FETCH}:g1:${bucket}`);
    expect(fetch.opts?.failParentOnFailure).toBe(true);
    expect(fetch.children).toBeUndefined();
  });

  it('applies the same bounded-retry policy to every node', () => {
    for (const node of [flow, publish, save, generate, fetch]) {
      expect(node.opts?.attempts).toBe(3);
      expect(node.opts?.backoff).toEqual({ type: 'exponential', delay: 2000 });
    }
  });
});

describe('intFromEnv', () => {
  afterEach(() => delete process.env.TEST_CONC);
  it('parses a positive integer from the env', () => {
    process.env.TEST_CONC = '7';
    expect(intFromEnv('TEST_CONC', 2)).toBe(7);
  });
  it('falls back when unset or invalid', () => {
    expect(intFromEnv('TEST_CONC', 2)).toBe(2);
    process.env.TEST_CONC = 'abc';
    expect(intFromEnv('TEST_CONC', 2)).toBe(2);
  });
  it('falls back for zero, negative, and non-integer values', () => {
    process.env.TEST_CONC = '0';
    expect(intFromEnv('TEST_CONC', 2)).toBe(2);
    process.env.TEST_CONC = '-3';
    expect(intFromEnv('TEST_CONC', 2)).toBe(2);
    process.env.TEST_CONC = '3.5';
    expect(intFromEnv('TEST_CONC', 2)).toBe(2);
  });
});

describe('firstChildValue', () => {
  it('returns the single child return value', () => {
    expect(firstChildValue({ 'bull:q:jid': { skipped: true } })).toEqual({ skipped: true });
  });
  it('returns undefined when there are no children', () => {
    expect(firstChildValue({})).toBeUndefined();
  });
});
