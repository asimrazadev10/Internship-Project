import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureGateGuard } from './feature-gate.guard';

function makeGuard(overrides: Record<string, boolean>): FeatureGateGuard {
  const config = {
    get: <T>(key: string, fallback?: T): T => {
      const v = overrides[key];
      return (v === undefined ? fallback : v) as T;
    },
  } as unknown as ConfigService;
  return new FeatureGateGuard(config);
}

function httpContext(path?: string): any {
  let res: any;
  const fn = (): void => res;
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ path }) }),
    getClass: fn,
    getHandler: fn,
  };
}

describe('FeatureGateGuard', () => {
  it('charges a path to the most specific matching feature', () => {
    const guard = makeGuard({ SERVICE_MESSAGES_ENABLED: false });
    expect(() =>
      guard.canActivate(httpContext('/groups/abc/messages')),
    ).toThrow(NotFoundException);
    expect(() =>
      guard.canActivate(httpContext('/groups/abc/messages/xyz/reactions')),
    ).toThrow(NotFoundException);
  });

  it('distinguishes a messages route from a plain groups route', () => {
    const guard = makeGuard({ SERVICE_GROUPS_ENABLED: false });
    expect(() => guard.canActivate(httpContext('/groups/abc'))).toThrow(
      NotFoundException,
    );
    expect(() =>
      guard.canActivate(httpContext('/groups/abc/messages')),
    ).not.toThrow();
  });

  it('allows a route whose feature flag is true', () => {
    const guard = makeGuard({ SERVICE_AUTH_ENABLED: true });
    expect(() => guard.canActivate(httpContext('/auth/login'))).not.toThrow();
  });

  it('defaults a flag to true when unset', () => {
    const guard = makeGuard({});
    expect(() => guard.canActivate(httpContext('/health'))).not.toThrow();
  });

  it('passes through paths outside every feature', () => {
    const guard = makeGuard({ SERVICE_GROUPS_ENABLED: false });
    expect(() =>
      guard.canActivate(httpContext('/uploads/foo.png')),
    ).not.toThrow();
  });

  it('passes through non-HTTP contexts (WebSocket has no request path)', () => {
    const guard = makeGuard({ SERVICE_GROUPS_ENABLED: false });
    expect(guard.canActivate({ getType: () => 'ws' } as any)).toBe(true);
  });
});
