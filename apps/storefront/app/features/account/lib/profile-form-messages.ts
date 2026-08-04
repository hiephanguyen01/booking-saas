import type {
  CustomerPasswordFormMessages,
  CustomerProfileFormMessages,
} from '@booking/contracts';
import type { NamespaceTranslationKey, NsI18n } from '@booking/i18n';

/**
 * The account namespace's translator, in its bare-key form. `useTranslation`'s
 * `t` satisfies this directly; a server caller holding the whole-app translator
 * adapts with `(key) => t(`account.${key}`)`.
 */
export type AccountTranslate = (key: NamespaceTranslationKey<NsI18n.Account>) => string;

/**
 * zod bakes messages into the schema, so both profile forms are built per
 * request from the visitor's locale. These two builders are the single place
 * that pairs a validation rule with its copy — the card (client validation) and
 * the action (server re-validation) call the same one, so a rejected field says
 * exactly the same thing whichever side caught it.
 */
export function profileFormMessages(t: AccountTranslate): CustomerProfileFormMessages {
  return {
    fullNameRequired: t('profile.formErrors.fullNameRequired'),
    fullNameTooLong: t('profile.formErrors.fullNameTooLong'),
    phoneTooShort: t('profile.formErrors.phoneTooShort'),
    phoneTooLong: t('profile.formErrors.phoneTooLong'),
  };
}

export function passwordFormMessages(t: AccountTranslate): CustomerPasswordFormMessages {
  return {
    currentPasswordRequired: t('profile.formErrors.currentPasswordRequired'),
    confirmPasswordRequired: t('profile.formErrors.confirmPasswordRequired'),
    passwordTooShort: t('profile.formErrors.passwordTooShort'),
    passwordTooLong: t('profile.formErrors.passwordTooLong'),
    passwordNoLetter: t('profile.formErrors.passwordNoLetter'),
    passwordNoDigit: t('profile.formErrors.passwordNoDigit'),
    passwordMismatch: t('profile.formErrors.passwordMismatch'),
    passwordSameAsCurrent: t('profile.formErrors.passwordSameAsCurrent'),
  };
}
