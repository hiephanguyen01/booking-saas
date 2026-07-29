import { z } from 'zod';
import type { NsI18n, ScopedTranslationKey } from '@booking/i18n';

/**
 * The partner password policy, declared once.
 *
 * It used to exist three times — a zod chain in `partner-password-route.server`,
 * a `RULES` string array driving the on-screen checklist, and a `PASSWORD_ERRORS`
 * map of the codes that chain emits — so a policy change had to land in three
 * places or the checklist would tell the visitor something untrue.
 *
 * It is deliberately stricter than `@booking/contracts`' `passwordSchema` (which
 * requires only length + a letter + a digit): the backend accepts what this
 * rejects. Making the API enforce the same rules is a contracts change, tracked
 * separately.
 */
interface PartnerPasswordRule {
  /** Emitted as the field-error code, and mapped back to copy by the page. */
  code: string;
  errorKey: ScopedTranslationKey<NsI18n.Auth>;
  /** Present when the rule is one the checklist advertises up front. */
  checklistKey?: ScopedTranslationKey<NsI18n.Auth>;
  test: (value: string) => boolean;
}

export const PARTNER_PASSWORD_RULES: readonly PartnerPasswordRule[] = [
  {
    code: 'passwordTooShort',
    errorKey: 'partner.errors.passwordTooShort',
    checklistKey: 'partner.passwordRules.length',
    test: (value) => value.length >= 8,
  },
  {
    code: 'passwordTooLong',
    errorKey: 'partner.errors.passwordTooLong',
    test: (value) => value.length <= 128,
  },
  {
    code: 'passwordNoLetter',
    errorKey: 'partner.errors.passwordNoLetter',
    test: (value) => /[A-Za-z]/.test(value),
  },
  {
    code: 'passwordNoUppercase',
    errorKey: 'partner.errors.passwordNoUppercase',
    checklistKey: 'partner.passwordRules.uppercase',
    test: (value) => /[A-Z]/.test(value),
  },
  {
    code: 'passwordNoDigit',
    errorKey: 'partner.errors.passwordNoDigit',
    checklistKey: 'partner.passwordRules.digit',
    test: (value) => /[0-9]/.test(value),
  },
  {
    code: 'passwordNoSpecial',
    errorKey: 'partner.errors.passwordNoSpecial',
    checklistKey: 'partner.passwordRules.special',
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];

/** The rules the page lists before the visitor types, in policy order. */
export const PARTNER_PASSWORD_CHECKLIST = PARTNER_PASSWORD_RULES.flatMap((rule) =>
  rule.checklistKey ? [rule.checklistKey] : [],
);

export const PARTNER_PASSWORD_ERROR_KEYS: Record<string, ScopedTranslationKey<NsI18n.Auth>> = {
  ...Object.fromEntries(PARTNER_PASSWORD_RULES.map((rule) => [rule.code, rule.errorKey])),
  passwordMismatch: 'errors.passwordMismatch',
};

/** Reports the first unmet rule, so the field error matches the checklist order. */
export const partnerPasswordSchema = z.object({
  password: z.string().superRefine((value, ctx) => {
    const failed = PARTNER_PASSWORD_RULES.find((rule) => !rule.test(value));
    if (failed) ctx.addIssue({ code: z.ZodIssueCode.custom, message: failed.code });
  }),
});
