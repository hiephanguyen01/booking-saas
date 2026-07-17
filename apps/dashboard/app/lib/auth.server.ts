import { redirect } from 'react-router';
import type { ScopeLevel, SessionInfoResponse } from '@booking/contracts';
import { defaultAreaFor, hasPermission, hasScope } from '@booking/auth';
import {
  getCurrentDashboardAuth,
  type DashboardAuthContext as AuthContext,
} from './request-auth.server';
import type { DashboardSessionData as AuthedUser } from './session.server';
import { dashboardPaths } from '~/constants/paths';

export { defaultAreaFor, hasPermission, hasScope };
export type { AuthContext, AuthedUser };

export async function getOptionalUser(_request?: Request): Promise<AuthedUser | null> {
  return getCurrentDashboardAuth()?.user ?? null;
}

export async function requireUser(request?: Request): Promise<AuthedUser> {
  const user = await getOptionalUser(request);
  if (!user) throw redirect(dashboardPaths.auth.login);
  return user;
}

export async function loadSessionInfo(_request?: Request): Promise<SessionInfoResponse | null> {
  return getCurrentDashboardAuth()?.info ?? null;
}

export async function requireSessionInfo(_request?: Request): Promise<AuthContext> {
  const auth = getCurrentDashboardAuth();
  if (!auth) throw redirect(dashboardPaths.auth.login);
  return auth;
}

function forbidden(what: string): Response {
  return new Response(`Bạn không có quyền truy cập (${what}).`, { status: 403 });
}

export async function requireScope(_request: Request, scope: ScopeLevel): Promise<AuthContext> {
  const ctx = await requireSessionInfo();
  if (!hasScope(ctx.info, scope)) throw forbidden(scope);
  return ctx;
}

export async function requirePermission(_request: Request, key: string): Promise<AuthContext> {
  const ctx = await requireSessionInfo();
  if (!hasPermission(ctx.info, key)) throw forbidden(key);
  return ctx;
}
