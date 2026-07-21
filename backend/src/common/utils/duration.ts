/**
 * Parses a short duration string ("15m", "7d") into milliseconds.
 *
 * @nestjs/jwt accepts these strings directly for token expiry, but the refresh token's
 * database `expiresAt` needs a concrete Date, so the same value has to be converted here.
 * Rather than pull in the `ms` package, this handles the small, explicit set the config uses.
 * An unrecognised format throws — a misconfigured expiry should fail loudly at startup, not
 * silently default to something surprising.
 */

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function parseDurationToMs(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());

  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Expected a number followed by s, m, h or d (e.g. "15m", "7d").`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];

  return amount * UNIT_MS[unit];
}
