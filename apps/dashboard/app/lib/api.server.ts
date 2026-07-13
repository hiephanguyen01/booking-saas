/**
 * Server-only BFF client for the dashboard. Every call runs on the React Router
 * server (loaders/actions) — NEVER from the browser. The backend authenticates
 * via httpOnly cookies (`sid` access, `rid` refresh), so we replay the stored
 * token values as a `Cookie` header. On a 401 we transparently refresh once
 * (rotating tokens) and retry, then hand the new tokens back via `onRefreshed`
 * so the caller can re-commit the dashboard session cookie.
 */

import type { SessionInfoResponse } from '@booking/shared';

const backendUrl = (): string => process.env.BACKEND_URL ?? 'http://localhost:3000';

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ApiAuth {
  /** Backend access token (the `sid` cookie value). */
  token: string;
  /** Backend refresh token (the `rid` cookie value) — enables auto-refresh on 401. */
  refreshToken?: string;
  /** Invoked with rotated tokens after a successful silent refresh. */
  onRefreshed?: (tokens: RefreshedTokens) => void;
  /** Scope headers required by the PermissionsGuard for tenant/partner routes. */
  tenantId?: string;
  partnerId?: string;
}

/** Either a bare access token or the full auth descriptor (for refresh + scope). */
export type Auth = string | ApiAuth;

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** RFC7807 `message` from the backend on error. */
  error?: string;
  /** Field-level errors when the backend returns a zod flatten shape. */
  errors?: Record<string, string[]>;
}

function normalize(auth: Auth): ApiAuth {
  return typeof auth === 'string' ? { token: auth } : auth;
}

function scopeHeaders(auth: ApiAuth): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.tenantId) headers['x-tenant-id'] = auth.tenantId;
  if (auth.partnerId) headers['x-partner-id'] = auth.partnerId;
  return headers;
}

/** Extract cookie name→value pairs from a fetch Response's Set-Cookie headers. */
function parseSetCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const raw of list) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    if (idx > -1) out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

async function doFetch(
  method: string,
  path: string,
  accessToken: string,
  extraHeaders: Record<string, string>,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    cookie: `sid=${accessToken}`,
    ...extraHeaders,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${backendUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** POST /auth/refresh with the stored refresh token; returns rotated tokens or null. */
async function refreshTokens(refreshToken: string): Promise<RefreshedTokens | null> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { accept: 'application/json', cookie: `rid=${refreshToken}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const cookies = parseSetCookies(res);
  if (!cookies.sid || !cookies.rid) return null;
  return { accessToken: cookies.sid, refreshToken: cookies.rid };
}

async function toResult<T>(res: Response): Promise<ApiResult<T>> {
  const status = res.status;
  if (status === 204) return { ok: true, status, data: null };
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (res.ok) return { ok: true, status, data: payload as T };
  const body = (payload ?? {}) as { message?: string; error?: string; fieldErrors?: Record<string, string[]> };
  return {
    ok: false,
    status,
    data: null,
    error: body.message ?? body.error ?? `Request failed (${status})`,
    errors: body.fieldErrors,
  };
}

async function request<T>(
  method: string,
  path: string,
  auth: Auth,
  body?: unknown,
): Promise<ApiResult<T>> {
  const a = normalize(auth);
  const extra = scopeHeaders(a);

  let res: Response;
  try {
    res = await doFetch(method, path, a.token, extra, body);
  } catch {
    return { ok: false, status: 503, data: null, error: 'Không kết nối được máy chủ.' };
  }

  // Silent refresh + single retry on an expired access session.
  if (res.status === 401 && a.refreshToken) {
    const rotated = await refreshTokens(a.refreshToken);
    if (rotated) {
      a.onRefreshed?.(rotated);
      try {
        res = await doFetch(method, path, rotated.accessToken, extra, body);
      } catch {
        return { ok: false, status: 503, data: null, error: 'Không kết nối được máy chủ.' };
      }
    }
  }

  return toResult<T>(res);
}

export function apiGet<T>(path: string, auth: Auth): Promise<ApiResult<T>> {
  return request<T>('GET', path, auth);
}

// ── Unauthenticated auth-flow helpers (login/session/logout) ──────────────────
// These run before a dashboard session exists, so they don't use `request()`.

export interface BackendLoginResult {
  ok: boolean;
  status: number;
  /** Token values lifted from the backend's Set-Cookie headers. */
  tokens?: RefreshedTokens;
  user?: { id: string };
  /** Backend error code (e.g. ACCOUNT_LOCKED) when !ok. */
  code?: string;
}

/** Exchanges email+password for the backend session tokens (from Set-Cookie). */
export async function backendLogin(credentials: {
  email: string;
  password: string;
}): Promise<BackendLoginResult> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(credentials),
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
    tokens: { accessToken: cookies.sid, refreshToken: cookies.rid },
    user: body.user,
  };
}

/** Loads scope memberships for a fresh access token (used right after login). */
export async function backendSessionInfo(accessToken: string): Promise<SessionInfoResponse | null> {
  const res = await apiGet<SessionInfoResponse>('/auth/session', accessToken);
  return res.ok ? res.data : null;
}

/** Best-effort backend logout (revokes the session server-side). */
export async function backendLogout(accessToken: string): Promise<void> {
  try {
    await fetch(`${backendUrl()}/auth/logout`, {
      method: 'POST',
      headers: { accept: 'application/json', cookie: `sid=${accessToken}` },
    });
  } catch {
    // ignore — the dashboard cookie is destroyed regardless
  }
}

export function apiPost<T>(path: string, body: unknown, auth: Auth): Promise<ApiResult<T>> {
  return request<T>('POST', path, auth, body);
}

export function apiPatch<T>(path: string, body: unknown, auth: Auth): Promise<ApiResult<T>> {
  return request<T>('PATCH', path, auth, body);
}

export function apiPut<T>(path: string, body: unknown, auth: Auth): Promise<ApiResult<T>> {
  return request<T>('PUT', path, auth, body);
}

export function apiDelete<T>(path: string, auth: Auth): Promise<ApiResult<T>> {
  return request<T>('DELETE', path, auth);
}
