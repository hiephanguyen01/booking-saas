import { describe, expect, it, vi } from 'vitest';
import type { SessionInfoResponse } from '@booking/contracts';
import type { DashboardSessionData, DashboardSessionService } from './session.server';
import {
  createDashboardAuthMiddleware,
  type DashboardAuthenticationResult,
} from './auth-middleware.server';
import { getCurrentDashboardAuth, suppressAuthSessionCommit } from './request-auth.server';

const sessionData: DashboardSessionData = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  userId: 'user-1',
};

const info = {
  user: { id: 'user-1', fullName: 'Test User' },
  scopes: [],
} as unknown as SessionInfoResponse;

function makeSessionService() {
  const read = vi.fn(async () => ({ id: 'opaque-id', data: sessionData }));
  const rotate = vi.fn(async () => undefined);
  const destroy = vi.fn(async () => '__dashboard_session=; Max-Age=0; Path=/');
  const service: DashboardSessionService = {
    read,
    create: vi.fn(async () => ''),
    rotate,
    destroy,
  };
  return { service, read, rotate, destroy };
}

function request(path = '/tenant', method = 'GET') {
  return new Request(`http://dashboard.test${path}`, { method });
}

describe('Dashboard auth middleware', () => {
  it('authenticates once and shares one context with every nested guard', async () => {
    const { service } = makeSessionService();
    const authenticate = vi.fn<() => Promise<DashboardAuthenticationResult>>(async () => ({
      kind: 'authenticated',
      info,
      sessionData,
    }));
    const middleware = createDashboardAuthMiddleware({ sessionService: service, authenticate });

    const response = await middleware({ request: request() }, async () => {
      expect(getCurrentDashboardAuth()).toEqual({ user: sessionData, info });
      expect(getCurrentDashboardAuth()).toEqual({ user: sessionData, info });
      return new Response('ok');
    });

    expect(await response.text()).toBe('ok');
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it('persists rotated tokens exactly once after downstream work completes', async () => {
    const { service, rotate } = makeSessionService();
    const rotated = {
      ...sessionData,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    };
    const middleware = createDashboardAuthMiddleware({
      sessionService: service,
      authenticate: async () => ({ kind: 'authenticated', info, sessionData: rotated, rotated: true }),
    });

    await middleware({ request: request() }, async () => {
      expect(getCurrentDashboardAuth()?.user.accessToken).toBe('access-2');
      expect(rotate).not.toHaveBeenCalled();
      return new Response('ok');
    });

    expect(rotate).toHaveBeenCalledTimes(1);
    expect(rotate).toHaveBeenCalledWith('opaque-id', rotated);
  });

  it('does not recreate a rotated session after logout suppresses the commit', async () => {
    const { service, rotate } = makeSessionService();
    const middleware = createDashboardAuthMiddleware({
      sessionService: service,
      authenticate: async () => ({
        kind: 'authenticated',
        info,
        sessionData: { ...sessionData, accessToken: 'access-2' },
        rotated: true,
      }),
    });

    await middleware({ request: request('/auth/logout', 'POST') }, async () => {
      suppressAuthSessionCommit();
      return new Response(null, { status: 302, headers: { Location: '/auth/login' } });
    });

    expect(rotate).not.toHaveBeenCalled();
  });

  it('clears invalid credentials but preserves sessions during auth outages', async () => {
    const invalid = makeSessionService();
    const invalidMiddleware = createDashboardAuthMiddleware({
      sessionService: invalid.service,
      authenticate: async () => ({ kind: 'invalid' }),
    });

    const response = await invalidMiddleware({ request: request() }, async () => new Response('guest'));
    expect(invalid.destroy).toHaveBeenCalledTimes(1);
    expect(response.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);

    const unavailable = makeSessionService();
    const unavailableMiddleware = createDashboardAuthMiddleware({
      sessionService: unavailable.service,
      authenticate: async () => ({ kind: 'unavailable' }),
    });

    await expect(
      unavailableMiddleware({ request: request() }, async () => new Response('never')),
    ).rejects.toMatchObject({ status: 503 });
    expect(unavailable.destroy).not.toHaveBeenCalled();
  });

  it('bypasses stale-session processing for a login mutation', async () => {
    const { service, read } = makeSessionService();
    const authenticate = vi.fn<() => Promise<DashboardAuthenticationResult>>();
    const middleware = createDashboardAuthMiddleware({ sessionService: service, authenticate });

    const response = await middleware(
      {
        request: request('/auth/login.data?_routes=routes%2Fauth%2Flogin', 'POST'),
        url: new URL('http://dashboard.test/auth/login'),
      },
      async () => new Response('logged-in'),
    );

    expect(await response.text()).toBe('logged-in');
    expect(read).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
  });
});
