import type { ScopeMembership } from '@booking/contracts';

export const SESSION_INFO_READER = Symbol('SESSION_INFO_READER');

/**
 * Reads every scope a user belongs to, with the permission keys resolved for
 * each scope (from role_assignments → roles → role_permissions, §14.4). Used by
 * the dashboard BFF to gate areas/nav — never for data access (that stays behind
 * RLS + the per-request PermissionsGuard).
 */
export interface ISessionInfoReader {
  listMemberships(userId: string): Promise<ScopeMembership[]>;
}
