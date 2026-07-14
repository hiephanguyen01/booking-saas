/**
 * Dashboard BFF client (server-only).
 *
 * Thin wrapper around the shared `@booking/api-client` package.
 * Binds the client to BACKEND_URL and re-exports all helpers for use
 * across dashboard loaders/actions.
 *
 * NEVER import this file in browser-side code.
 */

import { createApiClient } from '@booking/api-client';

export type {
  ApiAuth,
  ApiResult,
  Auth,
  BackendLoginResult,
  RefreshedTokens,
} from '@booking/api-client';

const backendUrl = (): string => process.env.BACKEND_URL ?? 'http://localhost:3000';

/** Lazily create a client per-request (process.env may change between hot-reloads in dev). */
function client() {
  return createApiClient(backendUrl());
}

export function apiGet<T>(path: string, auth: import('@booking/api-client').Auth) {
  return client().get<T>(path, auth);
}

export function apiPost<T>(path: string, body: unknown, auth: import('@booking/api-client').Auth) {
  return client().post<T>(path, body, auth);
}

export function apiPatch<T>(path: string, body: unknown, auth: import('@booking/api-client').Auth) {
  return client().patch<T>(path, body, auth);
}

export function apiPut<T>(path: string, body: unknown, auth: import('@booking/api-client').Auth) {
  return client().put<T>(path, body, auth);
}

export function apiDelete<T>(path: string, auth: import('@booking/api-client').Auth) {
  return client().delete<T>(path, auth);
}

export function backendLogin(credentials: { email: string; password: string }) {
  return client().login(credentials);
}

export function backendSessionInfo(accessToken: string) {
  return client().sessionInfo(accessToken);
}

export function backendLogout(accessToken: string) {
  return client().logout(accessToken);
}
