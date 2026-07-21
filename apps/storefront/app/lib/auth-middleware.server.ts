import { sessionInfoResponseSchema, type SessionInfoResponse } from '@booking/contracts';
import { apiGet, backendRefresh } from './api.server';
import { storefrontLogError, storefrontLogWarn } from './logger.server';
import {
  runWithStorefrontRequestContext,
  type StorefrontRequestContextState,
} from './request-context.server';
import {
  getStorefrontSessionService,
  SessionRefreshLockTimeoutError,
  type StorefrontSessionData,
  type StorefrontSessionService,
} from './session.server';
import type { StorefrontTenant } from './tenant.server';

type AuthResult =
  | {
      kind: 'authenticated';
      info: SessionInfoResponse;
      data: StorefrontSessionData;
    }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

type AccessResult = AuthResult | { kind: 'expired' };

async function checkAccess(data: StorefrontSessionData, request: Request): Promise<AccessResult> {
  const result = await apiGet<SessionInfoResponse>(request, '/auth/session', data.accessToken, {
    schema: sessionInfoResponseSchema,
  });
  if (result.ok && result.data) {
    return { kind: 'authenticated', info: result.data, data };
  }
  if (result.status === 401) return { kind: 'expired' };
  return result.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
}

async function authenticate(
  stored: { id: string; data: StorefrontSessionData },
  request: Request,
  service: StorefrontSessionService,
): Promise<AuthResult> {
  const initial = await checkAccess(stored.data, request);
  if (initial.kind !== 'expired') return initial;

  try {
    return await service.withRefreshLock<AuthResult>(stored.id, async () => {
      const latest = await service.readById(stored.id);
      if (!latest) return { kind: 'invalid' };

      const unchanged =
        latest.accessToken === stored.data.accessToken &&
        latest.refreshToken === stored.data.refreshToken;

      if (!unchanged) {
        const current = await checkAccess(latest, request);
        if (current.kind !== 'expired') return current;
      }

      const refreshed = await backendRefresh(request, latest.refreshToken);
      if (!refreshed.ok || !refreshed.tokens) {
        return refreshed.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
      }

      const next = { ...latest, ...refreshed.tokens };
      const retried = await checkAccess(next, request);
      if (retried.kind === 'expired') return { kind: 'invalid' };
      if (retried.kind !== 'authenticated') return retried;

      // Persist the rotated refresh token while the lock is still held. A waiting
      // request will then re-read and validate this new session instead of using
      // the now-invalid previous refresh token.
      await service.rotate(stored.id, next);
      return retried;
    });
  } catch (error) {
    if (error instanceof SessionRefreshLockTimeoutError) {
      storefrontLogWarn('auth.refresh_lock_timeout');
    } else {
      storefrontLogError('auth.session_refresh_failed', error);
    }
    return { kind: 'unavailable' };
  }
}

export async function storefrontAuthMiddleware(
  { request }: { request: Request },
  next: () => Promise<Response>,
  tenant: StorefrontTenant,
  requestId: string,
) {
  const state: StorefrontRequestContextState = {
    tenant,
    auth: null,
    request: {
      id: requestId,
      method: request.method.toUpperCase(),
      path: new URL(request.url).pathname,
    },
    suppressSessionCommit: false,
  };

  return runWithStorefrontRequestContext(state, async () => {
    const service = getStorefrontSessionService();
    let stored: Awaited<ReturnType<typeof service.read>>;
    try {
      stored = await service.read(request);
    } catch (error) {
      storefrontLogError('auth.session_read_failed', error);
      throw new Response('Session service temporarily unavailable', { status: 503 });
    }
    if (!stored) return next();

    const result = await authenticate(stored, request, service);
    if (result.kind === 'unavailable') {
      throw new Response('Authentication service temporarily unavailable', { status: 503 });
    }
    if (result.kind === 'invalid') {
      const response = await next();
      response.headers.append('Set-Cookie', await service.destroy(request));
      return response;
    }

    state.auth = { session: result.data, info: result.info };
    return next();
  });
}
