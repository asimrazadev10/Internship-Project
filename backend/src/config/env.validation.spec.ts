import { validateEnv } from './env.validation';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
};

describe('validateEnv — Phase 4 keys', () => {
  it('applies defaults for the summary knobs', () => {
    const cfg = validateEnv(base);
    expect(cfg.GEMINI_MODEL).toBe('gemini-2.0-flash');
    expect(cfg.SUMMARY_INTERVAL_MS).toBe(86400000);
    expect(cfg.SUMMARY_WINDOW_MS).toBe(86400000);
  });

  it('rejects a missing GOOGLE_GENERATIVE_AI_API_KEY', () => {
    const { GOOGLE_GENERATIVE_AI_API_KEY, ...withoutKey } = base;
    void GOOGLE_GENERATIVE_AI_API_KEY;
    expect(() => validateEnv(withoutKey)).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it('coerces SUMMARY_INTERVAL_MS from a string', () => {
    const cfg = validateEnv({ ...base, SUMMARY_INTERVAL_MS: '60000' });
    expect(cfg.SUMMARY_INTERVAL_MS).toBe(60000);
  });
});
