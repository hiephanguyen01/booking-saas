/**
 * Permission helpers — framework-agnostic.
 *
 * Operates on the `SessionInfoResponse` contract from @booking/contracts.
 * No React Router, Express, or NestJS imports.
 */

import type { ScopeLevel, SessionInfoResponse } from '@booking/contracts';

/** Returns true when the session has at least one membership at the given scope level. */
export function hasScope(info: SessionInfoResponse, scope: ScopeLevel): boolean {
  return info.scopes.some((membership) => membership.scope === scope);
}

/** Returns true when ANY of the user's scope memberships includes the given permission key. */
export function hasPermission(info: SessionInfoResponse, key: string): boolean {
  return info.scopes.some((scope) => scope.permissions.includes(key));
}

/**
 * Returns the "default landing area" for a user by their highest-privilege scope.
 * Useful for post-login redirects in the dashboard app.
 */
export function defaultAreaFor(info: SessionInfoResponse): string {
  if (hasScope(info, 'platform')) return '/admin';
  if (hasScope(info, 'tenant')) return '/tenant';
  if (hasScope(info, 'partner')) return '/partner';
  return '/';
}

/** Collects all unique permission keys across all scope memberships. */
export function allPermissions(info: SessionInfoResponse): Set<string> {
  const set = new Set<string>();
  for (const membership of info.scopes) {
    for (const perm of membership.permissions) {
      set.add(perm);
    }
  }
  return set;
}
