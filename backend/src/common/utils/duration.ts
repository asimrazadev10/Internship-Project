/**
 * HOW THIS FILE WORKS
 *   1. UNIT_MS — the four units this project's config actually uses.
 *   2. parseDurationToMs() — match "<number><unit>", then multiply. Throws on anything else.
 */

/**
 * Parses a short duration string ("15m", "7d") into milliseconds.
 *
 * @nestjs/jwt accepts these strings directly for token expiry, but the refresh token's
 * database `expiresAt` needs a concrete Date, so the same value has to be converted here.
 * Rather than pull in the `ms` package, this handles the small, explicit set the config uses.
 * An unrecognised format throws — a misconfigured expiry should fail loudly at startup, not
 * silently default to something surprising.
 */

// Written as products so the arithmetic is checkable by eye.
const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function parseDurationToMs(value: string): number {
  // Anchored at both ends, so "15m extra" is rejected rather than silently parsed as 15m.
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());

  if (!match) {
    // Throws rather than defaulting: called from a constructor, so this fails at boot.
    throw new Error(
      `Invalid duration "${value}". Expected a number followed by s, m, h or d (e.g. "15m", "7d").`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];

  // The regex already restricted `unit` to a key of UNIT_MS, so this lookup cannot be undefined.
  return amount * UNIT_MS[unit];
}
