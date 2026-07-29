import { Form, useActionData, useOutletContext } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import {
  PARTNER_PASSWORD_CHECKLIST,
  PARTNER_PASSWORD_ERROR_KEYS,
} from '~/features/partner-onboarding/lib/partner-password-rules';
import type { StorefrontContext } from '~/root';
import { AuthSplit, FormHeading } from './partner-auth-layout';
import { FormAlert, PasswordField, PrimaryButton } from './partner-form-controls';
import type { PartnerOnboardingActionData } from '~/features/partner-onboarding/server/partner-onboarding-shared.server';

export function PartnerPasswordPage() {
  const { tenant } = useOutletContext<StorefrontContext>();
  const actionData = useActionData<PartnerOnboardingActionData>();
  const { t } = useTranslation(NsI18n.Auth);

  const messageFor = (code?: string) => {
    if (!code) return undefined;
    const key = PARTNER_PASSWORD_ERROR_KEYS[code];
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
          {PARTNER_PASSWORD_CHECKLIST.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <div className="pt-5">
          <PrimaryButton>{t('partner.passwordSubmit')}</PrimaryButton>
        </div>
      </Form>
    </AuthSplit>
  );
}
