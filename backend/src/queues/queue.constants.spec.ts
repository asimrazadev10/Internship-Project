import {
  buildSummaryFlow,
  AI_QUEUE,
  SUMMARY_QUEUE,
  NOTIFICATION_QUEUE,
  JOB_GENERATE,
  JOB_SAVE,
  JOB_PUBLISH,
  concurrencyFromEnv,
  firstChildValue,
} from './queue.constants';

describe('buildSummaryFlow', () => {
  const since = new Date('2026-07-24T00:00:00.000Z');
  const bucket = 1_700_000_000_000;
  const flow = buildSummaryFlow('g1', since, bucket);

  it('roots at publish on the notification queue', () => {
    expect(flow.name).toBe(JOB_PUBLISH);
    expect(flow.queueName).toBe(NOTIFICATION_QUEUE);
    expect(flow.data).toEqual({ groupId: 'g1' });
    expect(flow.opts?.jobId).toBe(`${JOB_PUBLISH}:g1:${bucket}`);
  });

  it('nests save (summary queue) under publish, failing the parent on failure', () => {
    const save = flow.children![0];
    expect(save.name).toBe(JOB_SAVE);
    expect(save.queueName).toBe(SUMMARY_QUEUE);
    expect(save.data).toEqual({ groupId: 'g1' });
    expect(save.opts?.jobId).toBe(`${JOB_SAVE}:g1:${bucket}`);
    expect(save.opts?.failParentOnFailure).toBe(true);
  });

  it('nests generate (ai queue) at the leaf with the ISO window and retry policy', () => {
    const gen = flow.children![0].children![0];
    expect(gen.name).toBe(JOB_GENERATE);
    expect(gen.queueName).toBe(AI_QUEUE);
    expect(gen.data).toEqual({ groupId: 'g1', since: since.toISOString() });
    expect(gen.opts?.jobId).toBe(`${JOB_GENERATE}:g1:${bucket}`);
    expect(gen.opts?.failParentOnFailure).toBe(true);
    expect(gen.opts?.attempts).toBe(3);
    expect(gen.opts?.backoff).toEqual({ type: 'exponential', delay: 2000 });
  });

  it('applies the same bounded-retry policy to the save and publish nodes', () => {
    const save = flow.children![0];
    expect(save.opts?.attempts).toBe(3);
    expect(save.opts?.backoff).toEqual({ type: 'exponential', delay: 2000 });
    expect(flow.opts?.attempts).toBe(3);
    expect(flow.opts?.backoff).toEqual({ type: 'exponential', delay: 2000 });
  });
});

describe('concurrencyFromEnv', () => {
  afterEach(() => delete process.env.TEST_CONC);
  it('parses a positive integer from the env', () => {
    process.env.TEST_CONC = '7';
    expect(concurrencyFromEnv('TEST_CONC', 2)).toBe(7);
  });
  it('falls back when unset or invalid', () => {
    expect(concurrencyFromEnv('TEST_CONC', 2)).toBe(2);
    process.env.TEST_CONC = 'abc';
    expect(concurrencyFromEnv('TEST_CONC', 2)).toBe(2);
  });
  it('falls back for zero, negative, and non-integer values', () => {
    process.env.TEST_CONC = '0';
    expect(concurrencyFromEnv('TEST_CONC', 2)).toBe(2);
    process.env.TEST_CONC = '-3';
    expect(concurrencyFromEnv('TEST_CONC', 2)).toBe(2);
    process.env.TEST_CONC = '3.5';
    expect(concurrencyFromEnv('TEST_CONC', 2)).toBe(2);
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
