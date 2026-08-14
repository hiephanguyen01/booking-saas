import type { TenantInvitationStatus } from '@booking/contracts';
import {
  CannotEditSelf,
  LastManagerRemoved,
  PermissionEscalation,
} from './errors/tenant-access-errors';

/** The key whose disappearance locks a tenant out of its own staff management. */
export const TENANT_MEMBER_MANAGE_KEY = 'tenant.members.manage';
/** The partner-tier equivalent. */
export const PARTNER_MEMBER_MANAGE_KEY = 'partner.members.manage';

/**
 * A caller may only hand out permissions they hold. Rejects with the offending
 * keys rather than silently trimming them — a quietly weakened role is worse
 * than a refused one, because nobody learns the role is not what they asked for.
 */
export function assertGrantable(
  requested: readonly string[],
  callerHolds: ReadonlySet<string>,
): void {
  const excess = requested.filter((key) => !callerHolds.has(key));
  if (excess.length > 0) throw new PermissionEscalation(excess);
}

/** Demotion goes through someone else, so a mis-click cannot strand the tenant. */
export function assertNotSelf(callerUserId: string, targetUserId: string): void {
  if (callerUserId === targetUserId) throw new CannotEditSelf();
}

/**
 * `remaining` is the membership AS IT WOULD BE after the operation, and
 * `manageKey` is the permission whose disappearance strands that scope. The key
 * is a parameter rather than a constant because the same rule protects a tenant
 * from losing `tenant.members.manage` and a partner from losing
 * `partner.members.manage` — checked on effective permissions, never on role
 * names, since a custom role can carry either key and `Tenant Owner` is a name.
 */
export function assertKeepsAManager(
  remaining: ReadonlyArray<{ userId: string; permissions: readonly string[] }>,
  manageKey: string,
): void {
  const stillManaged = remaining.some((m) => m.permissions.includes(manageKey));
  if (!stillManaged) throw new LastManagerRemoved();
}

/** Editing a member replaces the whole role set; the caller sends the target state. */
export function diffRoleIds(
  current: readonly string[],
  next: readonly string[],
): { add: string[]; remove: string[] } {
  const currentSet = new Set(current);
  const nextSet = new Set(next);
  return {
    add: next.filter((id) => !currentSet.has(id)),
    remove: current.filter((id) => !nextSet.has(id)),
  };
}

/** "Expired" is derived, never stored — `now` is passed in so this stays clock-free. */
export function invitationStateOf(
  row: { status: 'pending' | 'accepted' | 'revoked'; expiresAt: Date },
  now: Date,
): TenantInvitationStatus {
  if (row.status !== 'pending') return row.status;
  return row.expiresAt.getTime() <= now.getTime() ? 'expired' : 'pending';
}
