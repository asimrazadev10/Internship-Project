import { validateEnv } from './env.validation';

const base = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost:27017/testdb',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
};

describe('validateEnv — Phase 4 keys', () => {
  it('applies defaults for the summary knobs', () => {
    const cfg = validateEnv(base);
    expect(cfg.GEMINI_MODEL).toBe('gemini-3.5-flash');
    expect(cfg.SUMMARY_INTERVAL_MS).toBe(86400000);
    expect(cfg.SUMMARY_WINDOW_MS).toBe(86400000);
  });

  it('rejects a missing GOOGLE_GENERATIVE_AI_API_KEY', () => {
    const { GOOGLE_GENERATIVE_AI_API_KEY, ...withoutKey } = base;
    void GOOGLE_GENERATIVE_AI_API_KEY;
    expect(() => validateEnv(withoutKey)).toThrow(
      /GOOGLE_GENERATIVE_AI_API_KEY/,
    );
  });

  it('coerces SUMMARY_INTERVAL_MS from a string', () => {
    const cfg = validateEnv({ ...base, SUMMARY_INTERVAL_MS: '60000' });
    expect(cfg.SUMMARY_INTERVAL_MS).toBe(60000);
  });
});

describe('validateEnv — Phase 5 worker concurrency', () => {
  it('applies defaults for the per-worker concurrency knobs', () => {
    const cfg = validateEnv(base);
    expect(cfg.SCHEDULER_WORKER_CONCURRENCY).toBe(1);
    expect(cfg.AI_WORKER_CONCURRENCY).toBe(10);
    expect(cfg.SUMMARY_WORKER_CONCURRENCY).toBe(5);
    expect(cfg.NOTIFICATION_WORKER_CONCURRENCY).toBe(3);
  });

  it('coerces a concurrency knob from a string', () => {
    const cfg = validateEnv({ ...base, AI_WORKER_CONCURRENCY: '4' });
    expect(cfg.AI_WORKER_CONCURRENCY).toBe(4);
  });
});

describe('validateEnv — IS_WORKER_ENABLED feature flag', () => {
  it('defaults to true when unset', () => {
    expect(validateEnv(base).IS_WORKER_ENABLED).toBe(true);
  });

  it('keeps a literal "false" as false (not coerced by @Type)', () => {
    const cfg = validateEnv({ ...base, IS_WORKER_ENABLED: 'false' });
    expect(cfg.IS_WORKER_ENABLED).toBe(false);
  });

  it('accepts "true"', () => {
    expect(
      validateEnv({ ...base, IS_WORKER_ENABLED: 'true' }).IS_WORKER_ENABLED,
    ).toBe(true);
  });

  it('rejects a malformed value rather than silently defaulting', () => {
    expect(() => validateEnv({ ...base, IS_WORKER_ENABLED: '1' })).toThrow(
      /IS_WORKER_ENABLED/,
    );
    expect(() => validateEnv({ ...base, IS_WORKER_ENABLED: 'yes' })).toThrow(
      /IS_WORKER_ENABLED/,
    );
  });
});

describe('validateEnv — per-service flags', () => {
  it('defaults every SERVICE_*_ENABLED to true', () => {
    const cfg = validateEnv(base);
    expect(cfg.SERVICE_SCHEDULER_ENABLED).toBe(true);
    expect(cfg.SERVICE_AI_ENABLED).toBe(true);
    expect(cfg.SERVICE_SUMMARY_ENABLED).toBe(true);
    expect(cfg.SERVICE_NOTIFICATION_ENABLED).toBe(true);
  });

  it('defaults every per-feature flag to true', () => {
    const cfg = validateEnv(base);
    expect(cfg.SERVICE_AUTH_ENABLED).toBe(true);
    expect(cfg.SERVICE_GROUPS_ENABLED).toBe(true);
    expect(cfg.SERVICE_MESSAGES_ENABLED).toBe(true);
    expect(cfg.SERVICE_SUMMARIES_ENABLED).toBe(true);
    expect(cfg.SERVICE_HEALTH_ENABLED).toBe(true);
    expect(cfg.SERVICE_CHAT_ENABLED).toBe(true);
    expect(cfg.SERVICE_QUEUE_BOARD_ENABLED).toBe(true);
  });

  it('lets each feature be disabled independently', () => {
    const cfg = validateEnv({
      ...base,
      SERVICE_MESSAGES_ENABLED: 'false',
      SERVICE_CHAT_ENABLED: 'false',
    });
    expect(cfg.SERVICE_MESSAGES_ENABLED).toBe(false);
    expect(cfg.SERVICE_CHAT_ENABLED).toBe(false);
    expect(cfg.SERVICE_GROUPS_ENABLED).toBe(true);
    expect(cfg.SERVICE_AUTH_ENABLED).toBe(true);
  });

  it('rejects a malformed per-feature flag', () => {
    expect(() =>
      validateEnv({ ...base, SERVICE_CHAT_ENABLED: 'nope' }),
    ).toThrow(/SERVICE_CHAT_ENABLED/);
  });

  it('lets each worker be disabled independently', () => {
    const cfg = validateEnv({
      ...base,
      SERVICE_AI_ENABLED: 'false',
      SERVICE_NOTIFICATION_ENABLED: 'false',
    });
    expect(cfg.SERVICE_AI_ENABLED).toBe(false);
    expect(cfg.SERVICE_NOTIFICATION_ENABLED).toBe(false);
    expect(cfg.SERVICE_SCHEDULER_ENABLED).toBe(true);
    expect(cfg.SERVICE_SUMMARY_ENABLED).toBe(true);
  });

  it('rejects a malformed per-service flag', () => {
    expect(() => validateEnv({ ...base, SERVICE_AI_ENABLED: 'nope' })).toThrow(
      /SERVICE_AI_ENABLED/,
    );
  });
});
