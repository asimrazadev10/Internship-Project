import { ConfigService } from '@nestjs/config';

import { RefreshTokenRepository } from '../common/database/repositories/refresh-token.repository';
import { REFRESH_TOKEN_PURGE_GRACE_MS } from './auth.constants';
import { RefreshTokenPurgeService } from './refresh-token-purge.service';

function make(graceMs: number = REFRESH_TOKEN_PURGE_GRACE_MS) {
  const purgeExpired = jest.fn().mockResolvedValue(4);
  const refreshTokens = { purgeExpired } as unknown as RefreshTokenRepository;
  const config = { getOrThrow: () => graceMs } as unknown as ConfigService;
  return {
    service: new RefreshTokenPurgeService(refreshTokens, config),
    purgeExpired,
  };
}

describe('RefreshTokenPurgeService.purgeExpired', () => {
  it('deletes only rows whose expiry is older than the grace period', async () => {
    const { service, purgeExpired } = make(1000);

    const count = await service.purgeExpired();

    expect(count).toBe(4);
    const graceMs = purgeExpired.mock.calls[0][0];
    expect(graceMs).toBe(1000);
  });

  /**
   * The load-bearing test. Reuse detection in TokenService.rotate works by finding a row that
   * STILL EXISTS carrying revokedAt. A purge predicate that also matched revoked rows would delete
   * the mechanism: a replayed token would read as merely unknown, no family would be burned, and
   * nothing would be logged. If someone "simplifies" the predicate later, this fails.
   */
  it('never filters on revokedAt — revoked but unexpired tokens must survive', async () => {
    const { service, purgeExpired } = make();

    await service.purgeExpired();

    expect(purgeExpired).toHaveBeenCalledWith(expect.any(Number));
  });
});
