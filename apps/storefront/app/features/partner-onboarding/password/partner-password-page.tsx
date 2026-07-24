import { Form, useActionData, useOutletContext } from 'react-router';
import {
  NsI18n,
  useTranslation,
  type ScopedTranslationKey,
} from '../../../lib/i18n';
import type { StorefrontContext } from '../../../root';
import {
  AuthSplit,
  FormAlert,
  FormHeading,
  PasswordField,
  PrimaryButton,
} from '../../../routes/partner-onboarding/shared';
import type { PartnerOnboardingActionData } from '../server/partner-onboarding-shared.server';

/** Error codes emitted by `partnerPasswordSchema`, which cannot know the locale. */
const PASSWORD_ERRORS = {
  passwordTooShort: 'partner.errors.passwordTooShort',
  passwordTooLong: 'partner.errors.passwordTooLong',
  passwordNoLetter: 'partner.errors.passwordNoLetter',
  passwordNoDigit: 'partner.errors.passwordNoDigit',
  passwordNoUppercase: 'partner.errors.passwordNoUppercase',
  passwordNoSpecial: 'partner.errors.passwordNoSpecial',
  passwordMismatch: 'errors.passwordMismatch',
} as const satisfies Record<string, ScopedTranslationKey<NsI18n.Auth>>;

const RULES = ['length', 'uppercase', 'digit', 'special'] as const;

export function PartnerPasswordPage() {
  const { tenant } = useOutletContext<StorefrontContext>();
  const actionData = useActionData<PartnerOnboardingActionData>();
  const { t } = useTranslation(NsI18n.Auth);

  const messageFor = (code?: string) => {
    if (!code) return undefined;
    const key = PASSWORD_ERRORS[code as keyof typeof PASSWORD_ERRORS];
    return key ? t(key) : t('errors.generic');
  };

  return (
    <AuthSplit tenantName={tenant.name} tall>
      <FormHeading title={t('partner.passwordTitle')} />
      <Form method="post" className="space-y-4" noValidate>
        <FormAlert>{actionData?.error ? t('partner.errors.accountFailed') : undefined}</FormAlert>
        <PasswordField
          name="password"
          label={t('password.label')}
          error={messageFor(actionData?.fieldErrors?.password?.[0])}
          autoFocus
        />
        <PasswordField
          name="confirmPassword"
          label={t('password.confirm')}
          error={messageFor(actionData?.fieldErrors?.confirmPassword?.[0])}
        />
        <ul className="space-y-2 pt-1 text-sm font-medium leading-5 text-muted-foreground">
          {RULES.map((rule) => (
            <li key={rule}>{t(`partner.passwordRules.${rule}`)}</li>
          ))}
        </ul>
        <div className="pt-5">
          <PrimaryButton>{t('partner.passwordSubmit')}</PrimaryButton>
        </div>
      </Form>
    </AuthSplit>
  );
}
