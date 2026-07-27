import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as public, exempting it from the global JwtAuthGuard.
 *
 * The default is "protected": the guard is bound globally, so a route with no decorator
 * requires a valid token. @Public() is the deliberate, visible opt-out for the handful of
 * routes that must be reachable without one — register, login, google, refresh.
 *
 * The security reason for making protection the default: if a developer forgets to annotate a
 * new route, it ends up locked, not exposed. The failure mode is a 401 someone reports, not a
 * silent hole nobody notices.
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
