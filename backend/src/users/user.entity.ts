/**
 * HOW THIS FILE WORKS
 *   1. Declare the fields that MAY be serialised.
 *   2. Mark password and providerId @Exclude(), so the interceptor strips them.
 *   3. The constructor copies a Prisma User row wholesale via Object.assign.
 *
 * Step 3 is why step 2 matters: the hash IS copied onto the instance, and it is the global
 * ClassSerializerInterceptor that removes it on the way out.
 */
import { AuthProvider, User } from '@prisma/client';
import { Exclude } from 'class-transformer';

/**
 * Serialization-safe view of a User.
 *
 * Prisma's generated `User` type includes `password`. Returning that shape straight from a
 * controller would put the argon2 hash on the wire. Wrapping the row in this class and letting
 * the global ClassSerializerInterceptor run means @Exclude() strips the hash on the way out —
 * verified by the response-pipeline test, including when the entity is nested inside a
 * paginated { data, meta } payload.
 *
 * The rule this enforces: secrets are excluded by construction at the boundary, not by every
 * handler remembering to omit a field.
 */
export class UserEntity {
  id: string;
  email: string;
  name: string;
  provider: AuthProvider;
  createdAt: Date;

  // Step 2. The argon2id hash. Present on the instance, never in the response.
  @Exclude()
  password: string | null;

  // Google's subject id. Not secret, but an internal identity-linking detail with no reason
  // to appear in API responses.
  @Exclude()
  providerId: string | null;

  constructor(user: User) {
    // Copies every column, including the excluded ones — the interceptor is the real filter.
    Object.assign(this, user);
  }
}
