import { sessionInfoResponseSchema, type SessionInfoResponse } from '@booking/contracts';
import { apiGet, backendRefresh } from './api.server';
import { loadAuthSessionSnapshot } from './auth-session-snapshot.server';
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

interface SessionCacheIdentity {
  tenantId: string;
  sessionId: string;
}

async function checkAccess(
  data: StorefrontSessionData,
  request: Request,
  identity: SessionCacheIdentity,
): Promise<AccessResult> {
  const result = await loadAuthSessionSnapshot({
    ...identity,
    accessToken: data.accessToken,
    probe: () =>
      apiGet<SessionInfoResponse>(request, '/auth/session', data.accessToken, {
        schema: sessionInfoResponseSchema,
      }),
  });
  if (result.ok && result.data) {
    return { kind: 'authenticated', info: result.data, data };
  }
  if (result.status === 401) return { kind: 'expired' };
  return result.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
}

function sameSessionTokens(left: StorefrontSessionData, right: StorefrontSessionData): boolean {
  return left.accessToken === right.accessToken && left.refreshToken === right.refreshToken;
}

async function authenticate(
  stored: { id: string; data: StorefrontSessionData },
  request: Request,
  service: StorefrontSessionService,
  tenantId: string,
): Promise<AuthResult> {
  const identity = { tenantId, sessionId: stored.id };
  const initial = await checkAccess(stored.data, request, identity);
  if (initial.kind !== 'expired') return initial;

  let observed = stored.data;

  try {
    return await service.withRefreshLock<AuthResult>(
      stored.id,
      async () => {
        const latest = await service.readById(stored.id);
        if (!latest) return { kind: 'invalid' };

        if (!sameSessionTokens(latest, observed)) {
          observed = latest;
          const current = await checkAccess(latest, request, identity);
          if (current.kind !== 'expired') return current;
        }

        const refreshed = await backendRefresh(request, latest.refreshToken);
        if (!refreshed.ok || !refreshed.tokens) {
          return refreshed.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
        }

        const next = { ...latest, ...refreshed.tokens };
        const retried = await checkAccess(next, request, identity);
        if (retried.kind === 'expired') return { kind: 'invalid' };
        if (retried.kind !== 'authenticated') return retried;

        // Persist the rotated refresh token while the lock is still held. All
        // contenders observe this change and validate the new session without
        // serially acquiring the refresh lock themselves.
        await service.rotate(stored.id, next);
        return retried;
      },
      async () => {
        const latest = await service.readById(stored.id);
        if (!latest) return { resolved: true, value: { kind: 'invalid' } };
        if (sameSessionTokens(latest, observed)) return { resolved: false };

        observed = latest;
        const current = await checkAccess(latest, request, identity);
        return current.kind === 'expired'
          ? { resolved: false }
          : { resolved: true, value: current };
      },
    );
  } catch (error) {
    if (!(error instanceof SessionRefreshLockTimeoutError)) {
      console.error('Storefront session refresh failed', error);
    }
    return { kind: 'unavailable' };
  }
}

export async function storefrontAuthMiddleware(
  { request }: { request: Request },
  next: () => Promise<Response>,
  tenant: StorefrontTenant,
) {
  const service = getStorefrontSessionService();
  let stored: Awaited<ReturnType<typeof service.read>>;
  try {
    stored = await service.read(request);
  } catch {
    throw new Response('Session service temporarily unavailable', { status: 503 });
  }
  if (!stored) {
    return runWithStorefrontRequestContext(
      { tenant, auth: null, suppressSessionCommit: false },
      next,
    );
  }
  const result = await authenticate(stored, request, service, tenant.id);
  if (result.kind === 'unavailable') {
    throw new Response('Authentication service temporarily unavailable', { status: 503 });
  }
  if (result.kind === 'invalid') {
    // Keep this state object by reference: login/onboarding actions may mark it
    // while they replace the stale session cookie with a newly-created session.
    const state: StorefrontRequestContextState = {
      tenant,
      auth: null,
      suppressSessionCommit: false,
    };
    const response = await runWithStorefrontRequestContext(state, next);

    // Do not append a stale-session deletion after an action has emitted a new
    // session cookie. Cookie order is significant and the deletion could win.
    if (!state.suppressSessionCommit) {
      response.headers.append('Set-Cookie', await service.destroy(request));
    }
    return response;
  }
  const state: StorefrontRequestContextState = {
    tenant,
    auth: { session: result.data, info: result.info },
    suppressSessionCommit: false,
  };
  return runWithStorefrontRequestContext(state, next);
}
