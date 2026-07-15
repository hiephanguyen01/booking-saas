import { sessionInfoResponseSchema, type SessionInfoResponse } from '@booking/contracts';
import { apiGet, backendRefresh } from './api.server';
import {
  runWithStorefrontRequestAuth,
  type StorefrontRequestAuthState,
} from './request-auth.server';
import { getStorefrontSessionService, type StorefrontSessionData } from './session.server';

type AuthResult =
  | {
      kind: 'authenticated';
      info: SessionInfoResponse;
      data: StorefrontSessionData;
      rotated: boolean;
    }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

async function authenticate(data: StorefrontSessionData, signal: AbortSignal): Promise<AuthResult> {
  const initial = await apiGet<SessionInfoResponse>('/auth/session', data.accessToken, {
    signal,
    schema: sessionInfoResponseSchema,
  });
  if (initial.ok && initial.data) {
    return { kind: 'authenticated', info: initial.data, data, rotated: false };
  }
  if (initial.status !== 401)
    return initial.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
  const refreshed = await backendRefresh(data.refreshToken, signal);
  if (!refreshed.ok || !refreshed.tokens) {
    return refreshed.status >= 500 ? { kind: 'unavailable' } : { kind: 'invalid' };
  }
  const next = { ...data, ...refreshed.tokens };
  const retried = await apiGet<SessionInfoResponse>('/auth/session', next.accessToken, {
    signal,
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
) {
  const service = getStorefrontSessionService();
  let stored: Awaited<ReturnType<typeof service.read>>;
  try {
    stored = await service.read(request);
  } catch {
    throw new Response('Session service temporarily unavailable', { status: 503 });
  }
  if (!stored) {
    return runWithStorefrontRequestAuth({ auth: null, suppressSessionCommit: false }, next);
  }
  const result = await authenticate(stored.data, request.signal);
  if (result.kind === 'unavailable') {
    throw new Response('Authentication service temporarily unavailable', { status: 503 });
  }
  if (result.kind === 'invalid') {
    const response = await runWithStorefrontRequestAuth(
      { auth: null, suppressSessionCommit: false },
      next,
    );
    response.headers.append('Set-Cookie', await service.destroy(request));
    return response;
  }
  const state: StorefrontRequestAuthState = {
    auth: { session: result.data, info: result.info },
    suppressSessionCommit: false,
  };
  const response = await runWithStorefrontRequestAuth(state, next);
  if (result.rotated && !state.suppressSessionCommit) await service.rotate(stored.id, result.data);
  return response;
}
