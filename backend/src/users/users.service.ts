/**
 * HOW THIS FILE WORKS
 *   1. findById() / findByEmail() — single-row lookups on unique columns.
 *   2. findByProviderId() — lookup on the composite (provider, providerId) key, for Google.
 *   3. create() — insert, letting the database enforce email uniqueness.
 *
 * Persistence only. Hashing, tokens and verification all live in the auth module.
 */
import { Injectable } from '@nestjs/common';
import {
  AuthProvider,
  UserDocument,
} from '../modules/users/schemas/user.schema';

import { UserRepository } from '../common/database/repositories/user.repository';

/**
 * Owns all persistence for User rows. Auth logic (hashing, tokens, verification) lives in the
 * auth module; this service only reads and writes the table, so the two concerns stay separable
 * and each is testable on its own.
 */
@Injectable()
export class UsersService {
  constructor(private readonly users: UserRepository) {}

  findById(id: string): Promise<UserDocument | null> {
    return this.users.findById(id);
  }

  // Callers pass an already-normalised email; the DTOs guarantee that.
  findByEmail(email: string): Promise<UserDocument | null> {
    return this.users.findByEmail(email);
  }

  /**
   * Look up a user by the OAuth provider identity (provider + provider's subject id).
   * Used by the Google flow to recognise a returning OAuth user.
   */
  findByProviderId(
    provider: AuthProvider,
    providerId: string,
  ): Promise<UserDocument | null> {
    return this.users.findByProviderId(provider, providerId);
  }

  /**
   * Create a user. Uniqueness of `email` is enforced by the database constraint, not a
   * pre-check here: the constraint is the only atomic guarantee, and a duplicate surfaces as
   * an error which the global AllExceptionsFilter maps to 409. A findByEmail-then-create would
   * be both racy and a duplication of a rule the schema already states.
   */
  create(data: {
    email: string;
    name: string;
    password?: string;
    provider: AuthProvider;
    providerId?: string;
  }): Promise<UserDocument> {
    return this.users.createUser(data);
  }
}
