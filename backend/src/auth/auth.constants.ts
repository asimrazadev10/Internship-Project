/**
 * Credential-shape policy and refresh-token cryptography parameters.
 *
 * Two groups of values, both previously written as bare literals at their use sites.
 *
 * The LENGTH bounds are duplicated across a boundary by necessity: RegisterDto and LoginDto must
 * agree with each other (a password that registers must be able to log in), and the browser form
 * enforces the same rules a second time so the user is not told "invalid" only after a round trip.
 * The frontend copy lives in frontend/src/lib/api-limits.ts and names this file as its source.
 *
 * The CRYPTO parameters are not tuning knobs — each encodes a security decision that is argued in
 * TokenService's doc comment. Naming them puts the decision and the number in the same place.
 */

// ---- Credential shape ----

/** RFC 5321 maximum length of an email address. */
export const EMAIL_MAX_LENGTH = 254;

/**
 * The single definition of what "the same email" means.
 *
 * Applied by RegisterDto, LoginDto and the Google sign-in path, so all three agree — the UNIQUE
 * constraint on User.email can only mean "one account per address" if every write and every
 * lookup normalises identically. Miss one and you get an account that exists but cannot be
 * signed into.
 *
 * Lowercasing the whole address is a deliberate simplification: the local part is technically
 * case-sensitive per RFC 5321, but no mail provider in practice treats it that way, and users
 * overwhelmingly expect Asim@x.com and asim@x.com to be one account.
 */
export const normalizeEmail = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Minimum password length. Enforced at registration only — see LoginDto for why not at login. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Upper bound on password length. argon2 has no 72-byte truncation issue (unlike bcrypt), but a
 * cap still stops a multi-megabyte body being fed into the hash function as a cheap DoS.
 */
export const PASSWORD_MAX_LENGTH = 128;

export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 80;

// ---- Refresh-token cryptography ----

/**
 * Entropy of an opaque refresh token: 48 random bytes → ~64 base64url characters.
 *
 * This size is what makes the SHA-256 choice below safe. Change it downward and the reasoning
 * behind the hash algorithm silently stops holding.
 */
export const REFRESH_TOKEN_BYTES = 48;

/** URL-safe encoding, so the token can travel in a body or header without escaping. */
export const REFRESH_TOKEN_ENCODING = 'base64url' as const;

/**
 * SHA-256, deliberately NOT a slow/memory-hard hash.
 *
 * The token is already CSPRNG output of REFRESH_TOKEN_BYTES, so there is no low-entropy secret to
 * brute-force — argon2 here would only add latency to every refresh. Hashing exists solely so a
 * leaked database table contains no usable tokens. (Contrast PasswordService, where the input IS
 * low-entropy and argon2id is therefore correct.)
 */
export const REFRESH_TOKEN_HASH_ALGORITHM = 'sha256' as const;

/**
 * How long a token stays in the table after it has EXPIRED, before the purge job deletes it.
 *
 * The grace period is the whole design, and the reason the obvious purge is wrong. Reuse
 * detection works by finding a row that still EXISTS and has `revokedAt` set (TokenService.rotate);
 * that is the entire mechanism. Purging on `revokedAt IS NOT NULL` would therefore delete the
 * security feature — a replayed token would read as merely unknown, the family would never be
 * burned, and nothing would log.
 *
 * So the purge only ever removes rows already past `expiresAt`, which `rotate` refuses anyway. The
 * one capability lost is burning a family via a token that was useless already, and burning is a
 * defensive action rather than an attack. This grace keeps recent replays detectable for a week
 * past expiry; revoked-but-unexpired rows are never touched at any age.
 */
export const REFRESH_TOKEN_PURGE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
