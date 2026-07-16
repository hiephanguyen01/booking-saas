import { Form, useActionData, useOutletContext } from 'react-router';
import { NsI18n, useTranslation, type ScopedTranslationKey } from '../../lib/i18n';
import {
  completePartnerPassword,
  requirePartnerPhaseOnly,
  type PartnerOnboardingActionData,
} from '../../lib/partner-onboarding.server';
import type { StorefrontContext } from '../../root';
import type { Route } from './+types/password';
import {
  AuthSplit,
  FormAlert,
  FormHeading,
  partnerMeta,
  PasswordField,
  PrimaryButton,
} from './shared';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  return partnerMeta(matches[0].loaderData.tenant.name, params.locale, 'password');
}
export const loader = ({ request, params }: Route.LoaderArgs) =>
  requirePartnerPhaseOnly(request, 'partner_registration_password', params.locale);
export const action = ({ request, params }: Route.ActionArgs) =>
  completePartnerPassword(request, params.locale);

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

export default function PartnerPassword() {
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
