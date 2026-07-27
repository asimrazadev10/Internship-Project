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

  @Exclude()
  password: string | null;

  // Google's subject id. Not secret, but an internal identity-linking detail with no reason
  // to appear in API responses.
  @Exclude()
  providerId: string | null;

  constructor(user: User) {
    Object.assign(this, user);
  }
}
