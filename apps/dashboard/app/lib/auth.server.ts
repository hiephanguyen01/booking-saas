import { redirect } from 'react-router';
import type { ScopeLevel, SessionInfoResponse } from '@booking/shared';
import { apiGet, type ApiAuth, type RefreshedTokens } from './api.server';
import { commitSession, getSession } from './session.server';

export interface AuthedUser {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/** The full authed context most guards return: raw tokens + resolved memberships. */
export interface AuthContext {
  user: AuthedUser;
  info: SessionInfoResponse;
}

/** Reads stored tokens; returns null when there is no (complete) session. */
export async function getOptionalUser(request: Request): Promise<AuthedUser | null> {
  const session = await getSession(request.headers.get('Cookie'));
  const accessToken = session.get('accessToken');
  const refreshToken = session.get('refreshToken');
  const userId = session.get('userId');
  if (!accessToken || !refreshToken || !userId) return null;
  return { accessToken, refreshToken, userId };
}

/** Guards a route: redirects to /auth/login when unauthenticated. */
export async function requireUser(request: Request): Promise<AuthedUser> {
  const user = await getOptionalUser(request);
  if (!user) throw redirect('/auth/login');
  return user;
}

/**
 * Fetches `/auth/session` (identity + scopes + permissions). On a silent token
 * refresh it re-commits the dashboard cookie and replays the request so the
 * loader re-runs with a valid session. Returns null when there is no usable
 * session (caller decides whether to redirect).
 */
export async function loadSessionInfo(request: Request): Promise<SessionInfoResponse | null> {
  const session = await getSession(request.headers.get('Cookie'));
  const accessToken = session.get('accessToken');
  const refreshToken = session.get('refreshToken');
  if (!accessToken || !refreshToken) return null;

  let rotated: RefreshedTokens | null = null;
  const auth: ApiAuth = {
    token: accessToken,
    refreshToken,
    onRefreshed: (tokens) => {
      rotated = tokens;
    },
  };
  const res = await apiGet<SessionInfoResponse>('/auth/session', auth);

  if (rotated) {
    const next: RefreshedTokens = rotated;
    session.set('accessToken', next.accessToken);
    session.set('refreshToken', next.refreshToken);
    throw redirect(request.url, {
      headers: { 'Set-Cookie': await commitSession(session) },
    });
  }
  if (!res.ok) return null;
  return res.data;
}

/** requireUser + loadSessionInfo; redirects to login if the session is dead. */
export async function requireSessionInfo(request: Request): Promise<AuthContext> {
  const user = await requireUser(request);
  const info = await loadSessionInfo(request);
  if (!info) throw redirect('/auth/login');
  return { user, info };
}

export function hasPermission(info: SessionInfoResponse, key: string): boolean {
  return info.scopes.some((scope) => scope.permissions.includes(key));
}

export function hasScope(info: SessionInfoResponse, scope: ScopeLevel): boolean {
  return info.scopes.some((membership) => membership.scope === scope);
}

function forbidden(what: string): Response {
  return new Response(`Bạn không có quyền truy cập (${what}).`, { status: 403 });
}

/** Guards an area by scope level (used by area `_layout.tsx` loaders). */
export async function requireScope(request: Request, scope: ScopeLevel): Promise<AuthContext> {
  const ctx = await requireSessionInfo(request);
  if (!hasScope(ctx.info, scope)) throw forbidden(scope);
  return ctx;
}

/** Guards a route by a single permission key (`scope.resource.action`). */
export async function requirePermission(request: Request, key: string): Promise<AuthContext> {
  const ctx = await requireSessionInfo(request);
  if (!hasPermission(ctx.info, key)) throw forbidden(key);
  return ctx;
}

/** The landing area for a user, by highest-privilege scope they hold. */
export function defaultAreaFor(info: SessionInfoResponse): string {
  if (hasScope(info, 'platform')) return '/admin';
  if (hasScope(info, 'tenant')) return '/tenant';
  if (hasScope(info, 'partner')) return '/partner';
  return '/';
}
