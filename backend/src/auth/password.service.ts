import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

/**
 * Password hashing, isolated behind one interface so the algorithm is a single-line change and
 * nothing else in the codebase knows which one is used.
 *
 * Algorithm: argon2id — OWASP's first recommendation. It is memory-hard, so an attacker with
 * GPUs or ASICs cannot parallelise cracking as cheaply as they can against bcrypt. It also has
 * no silent input-length truncation (bcrypt ignores everything past 72 bytes, which quietly
 * weakens long passphrases).
 *
 * The salt is generated per-hash by argon2 and stored inside the returned encoded string, so
 * there is no separate salt column to manage.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  /**
   * A real argon2id hash of a random throwaway value, computed once at startup. Login verifies
   * against this when no user is found, so the failure path spends the same CPU as the success
   * path and response time does not reveal whether an email exists. It uses the same cost
   * parameters as real hashes because it is produced by the same hash() call.
   */
  private dummyHash!: string;

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomBytes(32).toString('hex'));
  }

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  /**
   * argon2.verify reads the parameters (memory, iterations, salt) out of the stored hash
   * string, so a later change to hash() cost parameters does not break verification of
   * existing hashes. Returns false rather than throwing on a mismatch.
   */
  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  /** The startup-computed decoy hash, for the user-not-found branch of login. */
  getDummyHash(): string {
    return this.dummyHash;
  }
}
