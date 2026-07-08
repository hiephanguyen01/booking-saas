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

export const scopeLevelSchema = z.enum(['platform', 'tenant', 'partner']);
export type ScopeLevel = z.infer<typeof scopeLevelSchema>;
