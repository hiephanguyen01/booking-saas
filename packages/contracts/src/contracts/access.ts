import { z } from 'zod';

/**
 * The tenant half of the fixed permission catalog (§14.2). This schema is the
 * SINGLE source of the tenant keys: `permission-catalog.ts` builds its tenant
 * section from it, so the backend catalog and the dashboard's label map cannot
 * drift apart.
 */
export const tenantPermissionKeySchema = z.enum([
  'tenant.settings.manage',
  'tenant.legal.manage',
  'tenant.theme.manage',
  'tenant.partners.read',
  'tenant.partners.manage',
  'tenant.partners.approve',
  'tenant.listings.read',
  'tenant.listings.write',
  'tenant.listings.publish',
  'tenant.bookings.read',
  'tenant.bookings.manage',
  'tenant.bookings.cancel',
  'tenant.commissions.manage',
  'tenant.promotions.manage',
  'tenant.finance.read',
  'tenant.payouts.manage',
  'tenant.affiliates.manage',
  'tenant.members.manage',
  'tenant.roles.manage',
  'tenant.reports.read',
  'tenant.reviews.read',
  'tenant.favorites.read',
  'tenant.disputes.read',
  'tenant.disputes.resolve',
]);
export type TenantPermissionKey = z.infer<typeof tenantPermissionKeySchema>;

export const roleRefSchema = z.object({ id: z.string().uuid(), name: z.string() });
export type RoleRef = z.infer<typeof roleRefSchema>;

export const tenantRoleSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isSystem: z.boolean(),
  memberCount: z.number().int().nonnegative(),
});
export type TenantRoleSummary = z.infer<typeof tenantRoleSummarySchema>;

export const tenantRoleDetailSchema = tenantRoleSummarySchema.extend({
  permissions: z.array(tenantPermissionKeySchema),
});
export type TenantRoleDetail = z.infer<typeof tenantRoleDetailSchema>;

export const createTenantRoleInputSchema = z.object({
  name: z.string().trim().min(2, 'Tên vai trò quá ngắn').max(60, 'Tên vai trò quá dài'),
  permissions: z.array(tenantPermissionKeySchema).min(1, 'Chọn ít nhất một quyền'),
});
export type CreateTenantRoleInput = z.infer<typeof createTenantRoleInputSchema>;

export const updateTenantRoleInputSchema = createTenantRoleInputSchema;
export type UpdateTenantRoleInput = z.infer<typeof updateTenantRoleInputSchema>;

export const tenantMemberSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  roles: z.array(roleRefSchema),
  /** Union of every assigned role's keys — what the person can actually do. */
  permissions: z.array(tenantPermissionKeySchema),
  joinedAt: z.string(),
});
export type TenantMember = z.infer<typeof tenantMemberSchema>;

export const setTenantMemberRolesInputSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một vai trò'),
});
export type SetTenantMemberRolesInput = z.infer<typeof setTenantMemberRolesInputSchema>;

export const tenantInvitationStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired']);
export type TenantInvitationStatus = z.infer<typeof tenantInvitationStatusSchema>;

export const tenantInvitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  roles: z.array(roleRefSchema),
  status: tenantInvitationStatusSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
  invitedByName: z.string().nullable(),
});
export type TenantInvitation = z.infer<typeof tenantInvitationSchema>;

export const inviteTenantMemberInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  roleIds: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một vai trò'),
});
export type InviteTenantMemberInput = z.infer<typeof inviteTenantMemberInputSchema>;

export const tenantInvitationPreviewSchema = z.object({
  tenantName: z.string(),
  invitedEmail: z.string(),
  roles: z.array(roleRefSchema),
  status: tenantInvitationStatusSchema,
  /** False when the signed-in account is not the invited address. */
  matchesCurrentUser: z.boolean(),
  /** Set when the invitation is into a partner rather than the tenant itself. */
  partnerName: z.string().nullable(),
});
export type TenantInvitationPreview = z.infer<typeof tenantInvitationPreviewSchema>;

/**
 * The partner half of the fixed permission catalog (§14.2). Same role as
 * `tenantPermissionKeySchema`: the single source the backend catalog and the
 * dashboard's Vietnamese label map both build from, so they cannot drift.
 */
export const partnerPermissionKeySchema = z.enum([
  'partner.profile.manage',
  'partner.listings.read',
  'partner.listings.write',
  'partner.listings.publish',
  'partner.bookings.read',
  'partner.bookings.write',
  'partner.bookings.approve',
  'partner.bookings.cancel',
  'partner.availability.manage',
  'partner.promotions.manage', // enforced from Phase 2
  'partner.finance.read',
  'partner.members.manage',
  'partner.roles.manage',
  'partner.reviews.read',
  'partner.reviews.reply',
  'partner.favorites.read',
  'partner.disputes.read',
  'partner.disputes.respond',
]);
export type PartnerPermissionKey = z.infer<typeof partnerPermissionKeySchema>;

/**
 * The partner tier's assignable-role picker entry — unlike the tenant tier's
 * `roleRefSchema` (`{id, name}` only, permissions fetched separately behind
 * `tenant.roles.manage`), the partner tier has no such second endpoint (no
 * partner role-management screen exists), so its one assignable-roles route
 * is the only source and carries `permissions` directly.
 */
export const partnerRoleRefSchema = roleRefSchema.extend({
  permissions: z.array(partnerPermissionKeySchema),
});
export type PartnerRoleRef = z.infer<typeof partnerRoleRefSchema>;

export const partnerMemberSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  roles: z.array(roleRefSchema),
  permissions: z.array(partnerPermissionKeySchema),
  joinedAt: z.string(),
});
export type PartnerMember = z.infer<typeof partnerMemberSchema>;

export const invitePartnerMemberInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  roleIds: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một vai trò'),
});
export type InvitePartnerMemberInput = z.infer<typeof invitePartnerMemberInputSchema>;

export const setPartnerMemberRolesInputSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1, 'Chọn ít nhất một vai trò'),
});
export type SetPartnerMemberRolesInput = z.infer<typeof setPartnerMemberRolesInputSchema>;
