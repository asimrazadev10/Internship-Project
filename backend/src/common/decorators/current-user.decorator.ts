/**
 * HOW THIS FILE WORKS
 *   1. AuthUser — the principal JwtStrategy.validate() puts on the request.
 *   2. CurrentUser — a param decorator returning that principal, or one field of it.
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * The authenticated principal attached to the request by JwtStrategy.validate().
 *
 * Intentionally minimal: just what the access token carried. Handlers that need the full
 * user row load it through UsersService — the token is an identity claim, not a data cache.
 */
export interface AuthUser {
  userId: string;
  email: string;
}

/**
 * Pulls the authenticated user (or one of its fields) off the request.
 *
 *   @CurrentUser() user: AuthUser
 *   @CurrentUser('userId') id: string
 *
 * Keeps controllers free of req.user access, so handler signatures declare exactly what they
 * depend on.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    // Step 2. The generic types request.user, so the field access below is not `any`.
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    // `keyof AuthUser` means a typo in the field name is a compile error, not undefined.
    return field ? user?.[field] : user;
  },
);
