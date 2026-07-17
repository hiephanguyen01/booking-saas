import { sessionInfoResponseSchema, type SessionInfoResponse } from '@booking/contracts';
import { apiGet, backendRefresh } from './api.server';
import {
  runWithStorefrontRequestContext,
  type StorefrontRequestContextState,
} from './request-context.server';
import { getStorefrontSessionService, type StorefrontSessionData } from './session.server';
import type { StorefrontTenant } from './tenant-mapper';

type AuthResult =
  | {
      kind: 'authenticated';
      info: SessionInfoResponse;
      data: StorefrontSessionData;
      rotated: boolean;
    }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

async function authenticate(data: StorefrontSessionData, request: Request): Promise<AuthResult> {
  const initial = await apiGet<SessionInfoResponse>(request, '/auth/session', data.accessToken, {
    schema: sessionInfoResponseSchema,
  });
  if (initial.ok && initial.data) {
    return { kind: 'authenticated', info: initial.data, data, rotated: false };
  }
  if (initial.status !== 401) {
    return initial.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
  }
  const refreshed = await backendRefresh(request, data.refreshToken);
  if (!refreshed.ok || !refreshed.tokens) {
    return refreshed.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
  }
  const next = { ...data, ...refreshed.tokens };
  const retried = await apiGet<SessionInfoResponse>(request, '/auth/session', next.accessToken, {
    schema: sessionInfoResponseSchema,
  });
  if (!retried.ok || !retried.data) {
    return retried.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
  }
  return { kind: 'authenticated', info: retried.data, data: next, rotated: true };
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
  const result = await authenticate(stored.data, request);
  if (result.kind === 'unavailable') {
    throw new Response('Authentication service temporarily unavailable', { status: 503 });
  }
  if (result.kind === 'invalid') {
    const response = await runWithStorefrontRequestContext(
      { tenant, auth: null, suppressSessionCommit: false },
      next,
    );
    response.headers.append('Set-Cookie', await service.destroy(request));
    return response;
  }
  const state: StorefrontRequestContextState = {
    tenant,
    auth: { session: result.data, info: result.info },
    suppressSessionCommit: false,
  };
  const response = await runWithStorefrontRequestContext(state, next);
  if (result.rotated && !state.suppressSessionCommit) await service.rotate(stored.id, result.data);
  return response;
}
