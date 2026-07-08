export const PARTNER_ROLES = Symbol('PARTNER_ROLES');

/**
 * Cross-cutting role helpers for partner onboarding: looking up the seeded
 * `Partner Owner` system role and evicting a user's cached permissions after a
 * new assignment (so partner scope works on the next request, not 60s later).
 */
export interface IPartnerRoles {
  partnerOwnerRoleId(): Promise<string>;
  invalidateUserPermissions(userId: string): Promise<void>;
}
