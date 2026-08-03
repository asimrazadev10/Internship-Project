/**
 * HOW THIS FILE WORKS
 *   1. Declare the fields that MAY be serialised.
 *   2. Mark password and providerId @Exclude(), so the interceptor strips them.
 *   3. The constructor copies a Mongoose User document wholesale via Object.assign.
 *
 * Step 3 is why step 2 matters: the hash IS copied onto the instance, and it is the global
 * ClassSerializerInterceptor that removes it on the way out.
 */
import { Exclude } from 'class-transformer';
import {
  AuthProvider,
  UserDocument,
} from '../modules/users/schemas/user.schema';

/**
 * Serialization-safe view of a User.
 *
 * Mongoose's User document includes `password`. Returning that shape straight from a
 * controller would put the argon2 hash on the wire. Wrapping the row in this class and letting
 * the global ClassSerializerInterceptor run means @Exclude() strips the hash on the way out.
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

  constructor(user: UserDocument | { id: string; email: string }) {
    // Copy from a PLAIN snapshot, never the live Mongoose document: class-transformer walks
    // whatever is assigned here, and a live Document carries Mangoose internals
    // (stateMachine/_doc) that break serialization. toObject() yields a clean shape
    // (password is select:false so it is already excluded) and adds `id` via virtuals.
    const src: Record<string, unknown> = (
      typeof (user as { toObject?: unknown }).toObject === 'function'
        ? (user as UserDocument).toObject({ virtuals: true })
        : user
    ) as Record<string, unknown>;

    const idVal: unknown =
      '_id' in src && src._id ? src._id : (src as { id?: string }).id;
    if (idVal) {
      this.id =
        typeof idVal === 'string'
          ? idVal
          : (idVal as { toString(): string }).toString();
    }
    // Do not copy the raw ObjectId onto the entity; it serialises as a Buffer blob.
    if ('_id' in src && src._id) {
      delete src._id;
    }
    Object.assign(this, src);
  }
}
