import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@booking/ui/components/ui/field';
import { Input } from '@booking/ui/components/ui/input';
import { Mail, UserRound } from 'lucide-react';
import { Controller } from 'react-hook-form';
import { Link } from 'react-router';
import type { AuthActionData } from '~/lib/auth-types';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { LegalDocumentLinks } from '~/features/legal/components/legal-document-links';
import type { LegalConsentBundle } from '~/features/legal/server/legal.server';
import { AuthFormError, AuthPasswordInput, AuthSubmitButton } from './auth-form-controls';
import {
  useAuthStartFormController,
  type AuthStartMode,
} from '~/features/auth/hooks/use-auth-start-form-controller';

export function StartForm({
  mode,
  locale,
  actionData,
  legalConsent,
}: {
  mode: AuthStartMode;
  locale: 'vi' | 'en';
  actionData?: AuthActionData;
  /** Registration only — the current customer_terms + privacy_policy versions to accept. */
  legalConsent?: LegalConsentBundle;
}) {
  const { t } = useTranslation([NsI18n.Auth, NsI18n.Legal]);
  const { control, errors, register, submitForm, submitting } = useAuthStartFormController(
    mode,
    legalConsent,
  );

  return (
    <form method="post" onSubmit={submitForm} noValidate aria-busy={submitting}>
      <FieldGroup className="gap-5">
        <AuthFormError actionData={actionData} />
        {mode === 'register' ? (
          <Field data-invalid={Boolean(errors.fullName || actionData?.fieldErrors?.fullName)}>
            <FieldLabel htmlFor="fullName">{t('fields.fullName')}</FieldLabel>
            <div className="relative">
              <UserRound className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fullName"
                autoComplete="name"
                className="pl-11"
                aria-invalid={Boolean(errors.fullName)}
                disabled={submitting}
                {...register('fullName')}
              />
            </div>
            <FieldError errors={[errors.fullName]}>
              {actionData?.fieldErrors?.fullName?.[0]}
            </FieldError>
          </Field>
        ) : null}
        <Field data-invalid={Boolean(errors.email || actionData?.fieldErrors?.email)}>
          <FieldLabel htmlFor="email">{t('fields.email')}</FieldLabel>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              className="pl-11"
              aria-invalid={Boolean(errors.email)}
              disabled={submitting}
              {...register('email')}
            />
          </div>
          <FieldError errors={[errors.email]}>{actionData?.fieldErrors?.email?.[0]}</FieldError>
        </Field>
        {mode === 'login' ? (
          <Field data-invalid={Boolean(errors.password || actionData?.fieldErrors?.password)}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">{t('fields.password')}</FieldLabel>
              <Link
                to={storefrontPaths.forgotPassword(locale)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {t('login.forgot')}
              </Link>
            </div>
            <AuthPasswordInput
              id="password"
              autoComplete="current-password"
              registration={register('password')}
              invalid={Boolean(errors.password)}
              disabled={submitting}
            />
            <FieldError errors={[errors.password]}>
              {actionData?.fieldErrors?.password?.[0]}
            </FieldError>
          </Field>
        ) : null}
        {mode === 'register' && legalConsent ? (
          <Field data-invalid={Boolean(errors.acceptedTerms)}>
            <div className="flex items-start gap-2.5">
              <Controller
                control={control}
                name="acceptedTerms"
                render={({ field }) => (
                  <Checkbox
                    id="acceptedTerms"
                    checked={field.value ?? false}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    disabled={submitting}
                    className="mt-0.5"
                    aria-invalid={Boolean(errors.acceptedTerms)}
                  />
                )}
              />
              <FieldLabel htmlFor="acceptedTerms" className="text-sm font-normal">
                {t('legal:registerConsent')}
              </FieldLabel>
            </div>
            {legalConsent.documents.length ? (
              <LegalDocumentLinks
                documents={legalConsent.documents}
                locale={locale}
                className="pl-6.5 text-muted-foreground"
              />
            ) : null}
            <FieldError errors={[errors.acceptedTerms]} />
          </Field>
        ) : null}
        <AuthSubmitButton disabled={submitting}>
          {mode === 'register'
            ? t('register.submit')
            : mode === 'reset'
              ? t('forgot.submit')
              : t('login.submit')}
        </AuthSubmitButton>
      </FieldGroup>
    </form>
  );
}
