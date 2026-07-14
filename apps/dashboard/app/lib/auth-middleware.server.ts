import type { SessionInfoResponse } from '@booking/contracts';
import { apiGet, type ApiAuth, type RefreshedTokens } from './api.server';
import {
  getDashboardSessionService,
  type DashboardSessionData,
  type DashboardSessionService,
} from './session.server';
import {
  runWithDashboardRequestAuth,
  type DashboardRequestAuthState,
} from './request-auth.server';

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
  authenticate(data: DashboardSessionData): Promise<DashboardAuthenticationResult>;
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
  return url.pathname === '/auth/login' && request.method !== 'GET';
}

export function createDashboardAuthMiddleware({
  sessionService,
  authenticate,
}: DashboardAuthMiddlewareDependencies): DashboardMiddleware {
  return async ({ request, url = new URL(request.url) }, next) => {
    if (isLoginMutation(request, url)) {
      return runWithDashboardRequestAuth(
        { auth: null, suppressSessionCommit: false },
        next,
      );
    }

    const stored = await sessionService.read(request);
    if (!stored) {
      return runWithDashboardRequestAuth(
        { auth: null, suppressSessionCommit: false },
        next,
      );
    }

    const result = await authenticate(stored.data);
    if (result.kind === 'unavailable') {
      throw new Response('Dịch vụ xác thực đang tạm thời không khả dụng.', {
        status: 503,
        statusText: 'Authentication service unavailable',
      });
    }

    if (result.kind === 'invalid') {
      const response = await runWithDashboardRequestAuth(
        { auth: null, suppressSessionCommit: false },
        next,
      );
      response.headers.append('Set-Cookie', await sessionService.destroy(request));
      return response;
    }

    const state: DashboardRequestAuthState = {
      auth: { user: result.sessionData, info: result.info },
      suppressSessionCommit: false,
    };
    const response = await runWithDashboardRequestAuth(state, next);

    if (result.rotated && !state.suppressSessionCommit) {
      await sessionService.rotate(stored.id, result.sessionData);
    }

    return response;
  };
}

export async function authenticateDashboardSession(
  data: DashboardSessionData,
): Promise<DashboardAuthenticationResult> {
  let rotated: RefreshedTokens | null = null;
  const auth: ApiAuth = {
    token: data.accessToken,
    refreshToken: data.refreshToken,
    onRefreshed(tokens) {
      rotated = tokens;
    },
  };
  const result = await apiGet<SessionInfoResponse>('/auth/session', auth);

  if (!result.ok || !result.data) {
    return result.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
  }

  const tokens = rotated as RefreshedTokens | null;
  return {
    kind: 'authenticated',
    info: result.data,
    sessionData: tokens
      ? {
          ...data,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        }
      : data,
    rotated: Boolean(tokens),
  };
}

export async function dashboardAuthMiddleware(
  args: DashboardMiddlewareArgs,
  next: () => Promise<Response>,
): Promise<Response> {
  return createDashboardAuthMiddleware({
    sessionService: getDashboardSessionService(),
    authenticate: authenticateDashboardSession,
  })(args, next);
}
