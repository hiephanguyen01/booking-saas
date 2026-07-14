import { z } from 'zod';
import { localeSchema, uuidSchema } from './common';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128);

export const registerInputSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
  fullName: z.string().min(1).max(200),
  phone: z.string().min(6).max(20).optional(),
  locale: localeSchema.default('vi'),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const userStatusSchema = z.enum(['active', 'suspended']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const currentUserSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  fullName: z.string(),
  phone: z.string().nullable(),
  locale: localeSchema,
  status: userStatusSchema,
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const authSessionResponseSchema = z.object({
  user: currentUserSchema,
  /** Access-session expiry, ISO 8601 — cookies themselves are httpOnly. */
  accessExpiresAt: z.string(),
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

/** `POST /auth/refresh` payload — new access-session expiry (tokens ride httpOnly cookies). */
export const refreshResponseSchema = z.object({
  accessExpiresAt: z.string(),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

export const scopeLevelSchema = z.enum(['platform', 'tenant', 'partner']);
export type ScopeLevel = z.infer<typeof scopeLevelSchema>;

/**
 * One scope the logged-in user belongs to, with the permission keys resolved for
 * that scope. The dashboard shell uses these to gate areas/nav and to pick the
 * user's default landing area after login (§14.4). A `platform` membership has
 * both ids null; a `tenant` membership carries `tenantId`; a `partner`
 * membership carries both `tenantId` and `partnerId`.
 */
export const scopeMembershipSchema = z.object({
  scope: scopeLevelSchema,
  tenantId: uuidSchema.nullable(),
  tenantName: z.string().nullable(),
  partnerId: uuidSchema.nullable(),
  partnerName: z.string().nullable(),
  /** Role names assigned in this scope (for display only). */
  roles: z.array(z.string()),
  /** Fully-resolved permission keys (`scope.resource.action`) held in this scope. */
  permissions: z.array(z.string()),
});
export type ScopeMembership = z.infer<typeof scopeMembershipSchema>;

/**
 * `GET /auth/session` payload — the logged-in identity plus every scope
 * membership with resolved permissions. This is the single source the dashboard
 * BFF loads to render the shell and enforce route guards.
 */
export const sessionInfoResponseSchema = z.object({
  user: currentUserSchema,
  scopes: z.array(scopeMembershipSchema),
});
export type SessionInfoResponse = z.infer<typeof sessionInfoResponseSchema>;
