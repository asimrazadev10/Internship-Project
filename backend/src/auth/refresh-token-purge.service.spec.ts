import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { REFRESH_TOKEN_PURGE_GRACE_MS } from './auth.constants';
import { RefreshTokenPurgeService } from './refresh-token-purge.service';

function make(graceMs: number = REFRESH_TOKEN_PURGE_GRACE_MS) {
  const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
  const prisma = { refreshToken: { deleteMany } } as unknown as PrismaService;
  const config = { getOrThrow: () => graceMs } as unknown as ConfigService;
  return { service: new RefreshTokenPurgeService(prisma, config), deleteMany };
}

describe('RefreshTokenPurgeService.purgeExpired', () => {
  it('deletes only rows whose expiry is older than the grace period', async () => {
    const { service, deleteMany } = make(1000);
    const before = Date.now();

    const count = await service.purgeExpired();

    expect(count).toBe(4);
    const where = deleteMany.mock.calls[0][0].where as {
      expiresAt: { lt: Date };
    };
    const cutoff = where.expiresAt.lt.getTime();
    expect(cutoff).toBeLessThanOrEqual(before - 1000 + 5);
    expect(cutoff).toBeGreaterThan(before - 1000 - 5000);
  });

  /**
   * The load-bearing test. Reuse detection in TokenService.rotate works by finding a row that
   * STILL EXISTS carrying revokedAt. A purge predicate that also matched revoked rows would delete
   * the mechanism: a replayed token would read as merely unknown, no family would be burned, and
   * nothing would be logged. If someone "simplifies" the predicate later, this fails.
   */
  it('never filters on revokedAt — revoked but unexpired tokens must survive', async () => {
    const { service, deleteMany } = make();

    await service.purgeExpired();

    const where = deleteMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(Object.keys(where)).toEqual(['expiresAt']);
    expect(JSON.stringify(where)).not.toContain('revokedAt');
  });
});
