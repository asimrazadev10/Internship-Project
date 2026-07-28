/**
 * HOW THIS FILE WORKS
 *   1. Read the @Public() metadata for this handler and its controller.
 *   2. If present, allow the request through untouched.
 *   3. Otherwise defer to Passport's jwt guard, which verifies the Bearer token.
 *
 * Bound globally as APP_GUARD in AuthModule, so this runs on every route by default.
 */
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * The global authentication gate.
 *
 * Extends Passport's jwt AuthGuard but first checks for @Public() metadata: a public route
 * bypasses authentication entirely, everything else must carry a valid access token.
 *
 * getAllAndOverride checks the handler first, then the controller — so a controller can be
 * marked @Public() and an individual method can still opt back in, or vice versa.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Step 1. Handler first, then class — the more specific declaration wins.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Step 2. Returning true skips Passport entirely; no token is even looked for.
    if (isPublic) {
      return true;
    }

    // Step 3. Delegates to JwtStrategy, which populates request.user on success.
    return super.canActivate(context);
  }
}
