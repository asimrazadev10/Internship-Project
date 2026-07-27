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
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
