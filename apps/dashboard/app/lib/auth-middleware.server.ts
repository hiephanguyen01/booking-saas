import { sessionInfoResponseSchema, type SessionInfoResponse } from '@booking/contracts';
import type { ApiResult, BackendRefreshResult } from '@booking/api-client';
import { apiGet, backendRefresh } from './api.server';
import {
  getDashboardSessionService,
  type DashboardSessionData,
  type DashboardSessionService,
} from './session.server';
import {
  runWithDashboardRequestAuth,
  type DashboardRequestAuthState,
} from './request-auth.server';
import { resolveDashboardHost } from './tenant-host.server';
import { apiPaths } from '~/constants/api-paths';
import { dashboardPaths } from '~/constants/paths';

export type DashboardAuthenticationResult =
  | {
      kind: 'authenticated';
      info: SessionInfoResponse;
      sessionData: DashboardSessionData;
      rotated?: boolean;
    }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

interface DashboardAuthMiddlewareDependencies {
  sessionService: DashboardSessionService;
  authenticate(
    data: DashboardSessionData,
    signal?: AbortSignal,
  ): Promise<DashboardAuthenticationResult>;
}

interface DashboardMiddlewareArgs {
  request: Request;
  /** React Router-normalized application URL (without `.data` internals). */
  url?: URL;
}

type DashboardMiddleware = (
  args: DashboardMiddlewareArgs,
  next: () => Promise<Response>,
) => Promise<Response>;

function isLoginMutation(request: Request, url: URL): boolean {
  return url.pathname === dashboardPaths.auth.login && request.method !== 'GET';
}

function sessionServiceUnavailable(): Response {
  return new Response('Dịch vụ phiên đăng nhập đang tạm thời không khả dụng.', {
    status: 503,
    statusText: 'Session service unavailable',
  });
}

export function createDashboardAuthMiddleware({
  sessionService,
  authenticate,
}: DashboardAuthMiddlewareDependencies): DashboardMiddleware {
  return async ({ request, url = new URL(request.url) }, next) => {
    const host = await resolveDashboardHost(request);
    if (host.kind === 'unknown-host') {
      throw new Response('Không tìm thấy không gian quản trị cho tên miền này.', {
        status: 404,
        statusText: 'Unknown dashboard host',
      });
    }
    // A suspension is answered explicitly rather than as a 404: the caller typed
    // this hostname, so hiding the reason only makes it look like a broken domain.
    if (host.kind === 'tenant' && host.tenant.suspended) {
      throw new Response(`${host.tenant.name} đang bị tạm ngưng. Vui lòng liên hệ BookingOS.`, {
        status: 403,
        statusText: 'Tenant suspended',
      });
    }

    if (isLoginMutation(request, url)) {
      return runWithDashboardRequestAuth({ auth: null, host, suppressSessionCommit: false }, next);
    }

    let stored: Awaited<ReturnType<DashboardSessionService['read']>>;
    try {
      stored = await sessionService.read(request);
    } catch {
      throw sessionServiceUnavailable();
    }
    if (!stored) {
      return runWithDashboardRequestAuth({ auth: null, host, suppressSessionCommit: false }, next);
    }

    const result = await authenticate(stored.data, request.signal);
    if (result.kind === 'unavailable') {
      throw new Response('Dịch vụ xác thực đang tạm thời không khả dụng.', {
        status: 503,
        statusText: 'Authentication service unavailable',
      });
    }

    if (result.kind === 'invalid') {
      const response = await runWithDashboardRequestAuth(
        { auth: null, host, suppressSessionCommit: false },
        next,
      );
      response.headers.append('Set-Cookie', await sessionService.destroy(request));
      return response;
    }

    const state: DashboardRequestAuthState = {
      auth: { user: result.sessionData, info: result.info },
      host,
      suppressSessionCommit: false,
    };
    const response = await runWithDashboardRequestAuth(state, next);

    if (result.rotated && !state.suppressSessionCommit) {
      await sessionService.rotate(stored.id, result.sessionData);
    }

    return response;
  };
}

interface DashboardAuthApi {
  session(accessToken: string, signal?: AbortSignal): Promise<ApiResult<SessionInfoResponse>>;
  refresh(refreshToken: string, signal?: AbortSignal): Promise<BackendRefreshResult>;
}

function failedAuthentication(status: number): DashboardAuthenticationResult {
  return status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
}

export function createDashboardSessionAuthenticator({ session, refresh }: DashboardAuthApi) {
  return async (
    data: DashboardSessionData,
    signal?: AbortSignal,
  ): Promise<DashboardAuthenticationResult> => {
    const initial = await session(data.accessToken, signal);
    if (initial.ok && initial.data) {
      return { kind: 'authenticated', info: initial.data, sessionData: data };
    }
    if (initial.status !== 401) return failedAuthentication(initial.status);

    const refreshed = await refresh(data.refreshToken, signal);
    if (!refreshed.ok || !refreshed.tokens) return failedAuthentication(refreshed.status);

    const retried = await session(refreshed.tokens.accessToken, signal);
    if (!retried.ok || !retried.data) return failedAuthentication(retried.status);

    return {
      kind: 'authenticated',
      info: retried.data,
      sessionData: {
        ...data,
        accessToken: refreshed.tokens.accessToken,
        refreshToken: refreshed.tokens.refreshToken,
      },
      rotated: true,
    };
  };
}

export const authenticateDashboardSession = createDashboardSessionAuthenticator({
  session: (accessToken, signal) =>
    apiGet<SessionInfoResponse>(apiPaths.auth.session, accessToken, {
      signal,
      schema: sessionInfoResponseSchema,
    }),
  refresh: (refreshToken, signal) => backendRefresh(refreshToken, { signal }),
});

export async function dashboardAuthMiddleware(
  args: DashboardMiddlewareArgs,
  next: () => Promise<Response>,
): Promise<Response> {
  return createDashboardAuthMiddleware({
    sessionService: getDashboardSessionService(),
    authenticate: authenticateDashboardSession,
  })(args, next);
}
