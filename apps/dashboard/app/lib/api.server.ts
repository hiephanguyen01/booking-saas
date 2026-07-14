/**
 * Dashboard BFF client (server-only).
 *
 * Thin wrapper around the shared `@booking/api-client` package.
 * Binds the client to BACKEND_URL and re-exports all helpers for use
 * across dashboard loaders/actions.
 *
 * NEVER import this file in browser-side code.
 */

import {
  createApiClient,
  type ApiRequestOptions,
  type Auth,
} from '@booking/api-client';

export type {
  ApiAuth,
  ApiResult,
  Auth,
  BackendLoginResult,
  BackendRefreshResult,
  RefreshedTokens,
} from '@booking/api-client';

const backendUrl = (): string => process.env.BACKEND_URL ?? 'http://localhost:3000';

/** Lazily create a client per-request (process.env may change between hot-reloads in dev). */
function client() {
  return createApiClient(backendUrl());
}

export function apiGet<T>(path: string, auth: Auth, options?: ApiRequestOptions<T>) {
  return client().get<T>(path, auth, options);
}

export function apiPost<T>(
  path: string,
  body: unknown,
  auth: Auth,
  options?: ApiRequestOptions<T>,
) {
  return client().post<T>(path, body, auth, options);
}

export function apiPatch<T>(
  path: string,
  body: unknown,
  auth: Auth,
  options?: ApiRequestOptions<T>,
) {
  return client().patch<T>(path, body, auth, options);
}

export function apiPut<T>(
  path: string,
  body: unknown,
  auth: Auth,
  options?: ApiRequestOptions<T>,
) {
  return client().put<T>(path, body, auth, options);
}

export function apiDelete<T>(path: string, auth: Auth, options?: ApiRequestOptions<T>) {
  return client().delete<T>(path, auth, options);
}

export function backendLogin(credentials: { email: string; password: string }) {
  return client().login(credentials);
}

export function backendSessionInfo(accessToken: string) {
  return client().sessionInfo(accessToken);
}

export function backendRefresh(
  refreshToken: string,
  options?: Pick<ApiRequestOptions<never>, 'signal' | 'timeoutMs' | 'requestId'>,
) {
  return client().refresh(refreshToken, options);
}

export function backendLogout(accessToken: string) {
  return client().logout(accessToken);
}
