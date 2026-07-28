/**
 * HOW THIS FILE WORKS
 *   1. findById() / findByEmail() — single-row lookups on unique columns.
 *   2. findByProviderId() — lookup on the composite (provider, providerId) key, for Google.
 *   3. create() — insert, letting the database enforce email uniqueness.
 *
 * Persistence only. Hashing, tokens and verification all live in the auth module.
 */
import { Injectable } from '@nestjs/common';
import { AuthProvider, Prisma, User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Owns all persistence for User rows. Auth logic (hashing, tokens, verification) lives in the
 * auth module; this service only reads and writes the table, so the two concerns stay separable
 * and each is testable on its own.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // Callers pass an already-normalised email; the DTOs guarantee that.
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Look up a user by the OAuth provider identity (provider + provider's subject id).
   * Used by the Google flow to recognise a returning OAuth user.
   */
  findByProviderId(
    provider: AuthProvider,
    providerId: string,
  ): Promise<User | null> {
    // Step 2. The composite unique key — identity is the provider's sub, not the email.
    return this.prisma.user.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
  }

  /**
   * Create a user. Uniqueness of `email` is enforced by the database constraint, not a
   * pre-check here: the constraint is the only atomic guarantee, and a duplicate surfaces as
   * P2002 which the global AllExceptionsFilter maps to 409. A findByEmail-then-create would
   * be both racy and a duplication of a rule the schema already states.
   */
  create(data: Prisma.UserCreateInput): Promise<User> {
    // Returns the full row, password hash included — callers wrap it in UserEntity before responding.
    return this.prisma.user.create({ data });
  }
}
