/**
 * Generic BFF HTTP client (server-only).
 *
 * Every call runs on the React Router / NestJS server — NEVER from the browser.
 * The backend authenticates via httpOnly cookies (`sid` access, `rid` refresh).
 * On a 401 the interceptor transparently refreshes once and retries.
 *
 * Usage:
 *   const client = createApiClient(process.env.BACKEND_URL ?? 'http://localhost:3000');
 *   const result = await client.get<User>('/users/me', auth);
 */

import type { ApiResult, Auth, BackendLoginResult, RefreshedTokens } from './types';
import type { SessionInfoResponse } from '@booking/contracts';
import { toResult, networkError } from './errors';
import { normalizeAuth, scopeHeaders, refreshTokens, parseSetCookies } from './interceptor';

export interface ApiClient {
  get<T>(path: string, auth: Auth): Promise<ApiResult<T>>;
  post<T>(path: string, body: unknown, auth: Auth): Promise<ApiResult<T>>;
  patch<T>(path: string, body: unknown, auth: Auth): Promise<ApiResult<T>>;
  put<T>(path: string, body: unknown, auth: Auth): Promise<ApiResult<T>>;
  delete<T>(path: string, auth: Auth): Promise<ApiResult<T>>;
  /** Authenticate with email+password; returns session tokens from Set-Cookie. */
  login(credentials: { email: string; password: string }): Promise<BackendLoginResult>;
  /** Load scope memberships for a valid access token. */
  sessionInfo(accessToken: string): Promise<SessionInfoResponse | null>;
  /** Best-effort server-side logout. */
  logout(accessToken: string): Promise<void>;
}

function buildHeaders(
  token: string,
  extraHeaders: Record<string, string>,
  body?: unknown,
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    cookie: `sid=${token}`,
    ...extraHeaders,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return headers;
}

async function doFetch(
  baseUrl: string,
  method: string,
  path: string,
  accessToken: string,
  extraHeaders: Record<string, string>,
  body?: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: buildHeaders(accessToken, extraHeaders, body),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function request<T>(
  baseUrl: string,
  method: string,
  path: string,
  auth: Auth,
  body?: unknown,
): Promise<ApiResult<T>> {
  const a = normalizeAuth(auth);
  const extra = scopeHeaders(a);

  let res: Response;
  try {
    res = await doFetch(baseUrl, method, path, a.token, extra, body);
  } catch {
    return networkError<T>();
  }

  if (res.status === 401 && a.refreshToken) {
    const rotated = await refreshTokens(baseUrl, a.refreshToken);
    if (rotated) {
      a.onRefreshed?.(rotated);
      try {
        res = await doFetch(baseUrl, method, path, rotated.accessToken, extra, body);
      } catch {
        return networkError<T>();
      }
    }
  }

  return toResult<T>(res);
}

/** Factory: creates an ApiClient bound to a specific backend URL. */
export function createApiClient(baseUrl: string): ApiClient {
  return {
    get: (path, auth) => request(baseUrl, 'GET', path, auth),
    post: (path, body, auth) => request(baseUrl, 'POST', path, auth, body),
    patch: (path, body, auth) => request(baseUrl, 'PATCH', path, auth, body),
    put: (path, body, auth) => request(baseUrl, 'PUT', path, auth, body),
    delete: (path, auth) => request(baseUrl, 'DELETE', path, auth),

    async login({ email, password }) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        return { ok: false, status: 503 };
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        return { ok: false, status: res.status, code: body.code };
      }
      const cookies = parseSetCookies(res);
      const body = (await res.json().catch(() => null)) as { user?: { id: string } } | null;
      if (!cookies.sid || !cookies.rid || !body?.user) {
        return { ok: false, status: 502 };
      }
      return {
        ok: true,
        status: res.status,
        tokens: { accessToken: cookies.sid, refreshToken: cookies.rid } satisfies RefreshedTokens,
        user: body.user,
      };
    },

    async sessionInfo(accessToken) {
      const res = await request<SessionInfoResponse>(baseUrl, 'GET', '/auth/session', accessToken);
      return res.ok ? res.data : null;
    },

    async logout(accessToken) {
      try {
        await fetch(`${baseUrl}/auth/logout`, {
          method: 'POST',
          headers: { accept: 'application/json', cookie: `sid=${accessToken}` },
        });
      } catch {
        // ignore — the caller destroys the local session cookie regardless
      }
    },
  };
}
