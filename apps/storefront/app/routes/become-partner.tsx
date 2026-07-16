import { Form, useActionData, useOutletContext } from 'react-router';
import { NsI18n, useTranslation } from '../lib/i18n';
import {
  startPartnerRegistration,
  type PartnerOnboardingActionData,
} from '../lib/partner-onboarding.server';
import type { StorefrontContext } from '../root';
import type { Route } from './+types/become-partner';
import {
  AuthSplit,
  EmailField,
  FormAlert,
  FormHeading,
  LoginPrompt,
  partnerMeta,
  PrimaryButton,
} from './partner-onboarding/shared';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  return partnerMeta(matches[0].loaderData.tenant.name, params.locale, 'start');
}

export const action = ({ request, params }: Route.ActionArgs) =>
  startPartnerRegistration(request, params.locale);

export default function PartnerRegistrationStart() {
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
