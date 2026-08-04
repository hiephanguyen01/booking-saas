import { z } from 'zod';
import { localeSchema, uuidSchema } from './common';
import { dashboardBrandConfigSchema } from './tenancy';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_LETTER_RE = /[A-Za-z]/;
const PASSWORD_DIGIT_RE = /[0-9]/;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'Password must be at least 8 characters')
  .max(PASSWORD_MAX_LENGTH)
  .regex(PASSWORD_LETTER_RE, 'Password must contain at least one letter')
  .regex(PASSWORD_DIGIT_RE, 'Password must contain at least one number');

/**
 * The same policy as {@link passwordSchema}, exposed as predicates so a live
 * "password rules" indicator and the schema that rejects the password are read
 * off one definition and cannot drift into telling the user different things.
 */
export const PASSWORD_CHECKS = {
  length: (value: string) =>
    value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
  letter: (value: string) => PASSWORD_LETTER_RE.test(value),
  digit: (value: string) => PASSWORD_DIGIT_RE.test(value),
} as const;
export type PasswordCheck = keyof typeof PASSWORD_CHECKS;
/** Display order for the checklist — the order the rules are explained in. */
export const PASSWORD_CHECK_ORDER: readonly PasswordCheck[] = ['length', 'letter', 'digit'];

const challengeIdSchema = z.string().min(32).max(128);
const completionTokenSchema = z.string().min(32).max(256);
const otpCodeSchema = z.string().regex(/^\d{6}$/, 'Code must contain 6 digits');

/**
 * Field shape only. Kept as a plain object so form controllers can reach
 * `.shape.<field>`; the rule that consent must be present lives in
 * {@link registrationStartRequestSchema}, which is what the API validates.
 */
export const registrationStartInputSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().email().toLowerCase(),
  locale: localeSchema.default('vi'),
  tenantId: uuidSchema.optional(),
  acceptedVersionIds: z.array(uuidSchema).min(1).max(4).optional(),
  acceptedLocale: localeSchema.optional(),
});
export type RegistrationStartInput = z.infer<typeof registrationStartInputSchema>;

/**
 * What `POST /auth/registration/start` accepts. Consent is **required when the
 * registration is tenant-scoped** and impossible otherwise: a storefront signup
 * names its tenant and must carry the document versions the visitor ticked —
 * that tick is the evidence the whole legal feature exists to produce, and
 * leaving it optional made it a browser-only gate any scripted POST walked past
 * (the account was created with zero `agreement_acceptances` rows and no error).
 * The tenant-less caller — partner onboarding's "create an account first" step,
 * which registers a platform user before a tenant is chosen — has no documents
 * to name, which is why this is a refinement and not a plain required field.
 */
export const registrationStartRequestSchema = registrationStartInputSchema.superRefine(
  (value, ctx) => {
    if (value.tenantId && !value.acceptedVersionIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['acceptedVersionIds'],
        message: 'Consent to the tenant legal documents is required',
      });
    }
  },
);

export const passwordResetStartInputSchema = z.object({
  email: z.string().email().toLowerCase(),
  locale: localeSchema.default('vi'),
  tenantId: uuidSchema.optional(),
});
export type PasswordResetStartInput = z.infer<typeof passwordResetStartInputSchema>;

export const authChallengeInputSchema = z.object({
  challengeId: challengeIdSchema,
  /** Storefront tenant fallback for challenges issued before tenant branding was persisted. */
  tenantId: uuidSchema.optional(),
});
export type AuthChallengeInput = z.infer<typeof authChallengeInputSchema>;

export const authOtpVerifyInputSchema = z.object({
  challengeId: challengeIdSchema,
  code: otpCodeSchema,
});
export type AuthOtpVerifyInput = z.infer<typeof authOtpVerifyInputSchema>;

export const authChallengeResponseSchema = z.object({
  challengeId: challengeIdSchema,
  maskedDestination: z.string(),
  expiresInSec: z.number().int().positive(),
  resendAfterSec: z.number().int().nonnegative(),
});
export type AuthChallengeResponse = z.infer<typeof authChallengeResponseSchema>;

export const authOtpVerifiedResponseSchema = z.object({
  completionToken: completionTokenSchema,
  expiresInSec: z.number().int().positive(),
});
export type AuthOtpVerifiedResponse = z.infer<typeof authOtpVerifiedResponseSchema>;

export const authPasswordCompleteInputSchema = z.object({
  completionToken: completionTokenSchema,
  password: passwordSchema,
});
export type AuthPasswordCompleteInput = z.infer<typeof authPasswordCompleteInputSchema>;

export const authFlowCompleteResponseSchema = z.object({ success: z.literal(true) });
export type AuthFlowCompleteResponse = z.infer<typeof authFlowCompleteResponseSchema>;

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
  /** Profile photo `publicUrl` from a presigned upload; null when unset. */
  avatarUrl: z.string().nullable(),
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
  /** Parent tenant branding for tenant/partner dashboard shells; null at platform scope. */
  tenantBranding: dashboardBrandConfigSchema.nullable(),
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

/**
 * Copy for every message the profile schemas can show. The storefront is
 * bilingual and zod bakes its messages into the schema, so these schemas are
 * factories the caller feeds already-translated strings — that is what keeps a
 * validation error in the same language as the form around it. Callers that
 * have no locale (the API DTO) fall back to the English defaults below, which
 * a customer never sees: `sanitizeApiResult` replaces an API validation message
 * with a stable code on the way out.
 */
export interface CustomerProfileFormMessages {
  fullNameRequired: string;
  fullNameTooLong: string;
  phoneTooShort: string;
  phoneTooLong: string;
}

const DEFAULT_PROFILE_MESSAGES: CustomerProfileFormMessages = {
  fullNameRequired: 'Full name is required',
  fullNameTooLong: 'Full name must be at most 200 characters',
  phoneTooShort: 'Phone number must be at least 6 characters',
  phoneTooLong: 'Phone number must be at most 20 characters',
};

/**
 * `PATCH /auth/me` — the signed-in user edits their own profile.
 *
 * Email is deliberately absent: it is the login identity, so changing it needs
 * an OTP-verified flow of its own rather than a field on this form. An omitted
 * key means "leave unchanged"; an explicit `null` clears the value.
 */
export function updateMyProfileSchema(messages: CustomerProfileFormMessages) {
  return z.object({
    fullName: z.string().trim().min(1, messages.fullNameRequired).max(200, messages.fullNameTooLong),
    phone: z
      .string()
      .trim()
      .min(6, messages.phoneTooShort)
      .max(20, messages.phoneTooLong)
      .nullable()
      .optional(),
    /** Profile photo `publicUrl` from a presigned upload; null removes the photo. */
    avatarUrl: z.string().url().max(2048).nullable().optional(),
  });
}

/** The English instance the API DTO validates against. */
export const updateMyProfileInputSchema = updateMyProfileSchema(DEFAULT_PROFILE_MESSAGES);
export type UpdateMyProfileInput = z.infer<ReturnType<typeof updateMyProfileSchema>>;

/**
 * The profile *form*. It differs from the API contract in one way: a blank phone
 * is a legal input meaning "I have no phone", which the action turns into an
 * explicit `null`. Keeping that leniency out of the API schema means a direct
 * `PATCH` can still never store an empty string.
 */
export function customerProfileFormSchema(messages: CustomerProfileFormMessages) {
  return z.object({
    fullName: z
      .string()
      .trim()
      .min(1, messages.fullNameRequired)
      .max(200, messages.fullNameTooLong),
    phone: z
      .string()
      .trim()
      .max(20, messages.phoneTooLong)
      .refine((value) => value === '' || value.length >= 6, { message: messages.phoneTooShort }),
    avatarUrl: z.string().url().max(2048).nullable(),
  });
}
export type CustomerProfileFormInput = z.infer<ReturnType<typeof customerProfileFormSchema>>;

/** `POST /auth/me/password` — change the password while signed in. */
export const changeMyPasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type ChangeMyPasswordInput = z.infer<typeof changeMyPasswordInputSchema>;

/** Copy for every message the password-change form can show. See {@link CustomerProfileFormMessages}. */
export interface CustomerPasswordFormMessages {
  currentPasswordRequired: string;
  confirmPasswordRequired: string;
  passwordTooShort: string;
  passwordTooLong: string;
  passwordNoLetter: string;
  passwordNoDigit: string;
  passwordMismatch: string;
  passwordSameAsCurrent: string;
}

/**
 * The password-change *form*: the API contract plus the confirmation field the
 * user retypes. The password rules are spelled out here rather than reusing
 * {@link passwordSchema} so each one carries its own translated message — the
 * limits themselves still come from the constants that schema is built from.
 * Both cross-field rules are re-checked server-side.
 */
export function customerPasswordChangeSchema(messages: CustomerPasswordFormMessages) {
  return z
    .object({
      currentPassword: z.string().min(1, messages.currentPasswordRequired),
      newPassword: z
        .string()
        .min(PASSWORD_MIN_LENGTH, messages.passwordTooShort)
        .max(PASSWORD_MAX_LENGTH, messages.passwordTooLong)
        .regex(PASSWORD_LETTER_RE, messages.passwordNoLetter)
        .regex(PASSWORD_DIGIT_RE, messages.passwordNoDigit),
      confirmPassword: z.string().min(1, messages.confirmPasswordRequired),
    })
    .refine((value) => value.newPassword === value.confirmPassword, {
      path: ['confirmPassword'],
      message: messages.passwordMismatch,
    })
    .refine((value) => value.newPassword !== value.currentPassword, {
      path: ['newPassword'],
      message: messages.passwordSameAsCurrent,
    });
}
export type CustomerPasswordChangeInput = z.infer<ReturnType<typeof customerPasswordChangeSchema>>;
