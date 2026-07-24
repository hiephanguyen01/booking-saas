import { Form, useActionData, useOutletContext } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import type { StorefrontContext } from '../../../root';
import {
  AuthSplit,
  EmailField,
  FormAlert,
  FormHeading,
  LoginPrompt,
  PrimaryButton,
} from '../../../routes/partner-onboarding/shared';
import type { PartnerOnboardingActionData } from '../server/partner-onboarding-shared.server';

export function PartnerRegistrationStartPage() {
  const { tenant, locale, currentUser } = useOutletContext<StorefrontContext>();
  const actionData = useActionData<PartnerOnboardingActionData>();
  const { t } = useTranslation([NsI18n.Auth, NsI18n.Common]);
  const duplicate = actionData?.error === 'EMAIL_TAKEN';
  const emailError = actionData?.fieldErrors?.email?.[0];

  return (
    <AuthSplit tenantName={tenant.name}>
      <FormHeading
        title={t(currentUser ? 'auth:partner.continueTitle' : 'auth:partner.startTitle')}
        description={
          currentUser ? (
            <>
              {t('auth:partner.signedInAs')}{' '}
              <strong className="font-semibold text-foreground">{currentUser.email}</strong>
            </>
          ) : undefined
        }
      />
      <Form method="post" className="flex flex-col gap-10" noValidate>
        <FormAlert>
          {duplicate
            ? t('auth:partner.errors.emailTaken')
            : actionData?.error
              ? t('auth:partner.errors.startFailed')
              : undefined}
        </FormAlert>
        {currentUser ? null : (
          <EmailField
            error={
              emailError === 'invalidEmail'
                ? t('common:becomePartner.errors.invalidEmail')
                : duplicate
                  ? t('auth:partner.errors.emailTaken')
                  : undefined
            }
          />
        )}
        <PrimaryButton>
          {t(currentUser ? 'auth:partner.continue' : 'auth:partner.startTitle')}
        </PrimaryButton>
      </Form>
      {currentUser ? null : <LoginPrompt locale={locale} />}
    </AuthSplit>
  );
}
