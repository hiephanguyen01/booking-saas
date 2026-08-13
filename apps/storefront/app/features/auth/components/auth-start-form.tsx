import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@booking/ui/components/ui/field';
import { Input } from '@booking/ui/components/ui/input';
import { cn } from '@booking/ui/lib/utils';
import { CircleAlert, Mail, UserRound } from 'lucide-react';
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

const MOBILE_FIELD_LABEL =
  'max-md:text-xs max-md:font-bold max-md:uppercase max-md:tracking-[0.06em] max-md:text-muted-foreground';

const MOBILE_TEXT_INPUT =
  'pl-11 max-md:h-12 max-md:rounded-(--sf-surface-radius) max-md:bg-muted/45 max-md:shadow-none';

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
  const emailTaken = mode === 'register' && actionData?.error === 'EMAIL_TAKEN';
  const emailInvalid = Boolean(errors.email || actionData?.fieldErrors?.email || emailTaken);

  return (
    <form method="post" onSubmit={submitForm} noValidate aria-busy={submitting}>
      <FieldGroup className="gap-4 md:gap-5">
        <AuthFormError actionData={emailTaken ? undefined : actionData} />
        {mode === 'register' ? (
          <Field data-invalid={Boolean(errors.fullName || actionData?.fieldErrors?.fullName)}>
            <FieldLabel htmlFor="fullName" className={MOBILE_FIELD_LABEL}>
              {t('fields.fullName')}
            </FieldLabel>
            <div className="relative">
              <UserRound className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fullName"
                autoComplete="name"
                className={MOBILE_TEXT_INPUT}
                aria-invalid={Boolean(errors.fullName || actionData?.fieldErrors?.fullName)}
                disabled={submitting}
                {...register('fullName')}
              />
            </div>
            <FieldError errors={[errors.fullName]}>
              {actionData?.fieldErrors?.fullName?.[0]}
            </FieldError>
          </Field>
        ) : null}
        <Field data-invalid={emailInvalid}>
          <FieldLabel htmlFor="email" className={MOBILE_FIELD_LABEL}>
            {t('fields.email')}
          </FieldLabel>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              className={cn(MOBILE_TEXT_INPUT, emailInvalid && 'max-md:pr-11')}
              aria-invalid={emailInvalid}
              disabled={submitting}
              {...register('email')}
            />
            {emailInvalid ? (
              <CircleAlert
                className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-destructive md:hidden"
                aria-hidden="true"
              />
            ) : null}
          </div>
          <FieldError errors={[errors.email]}>
            {actionData?.fieldErrors?.email?.[0] ?? (emailTaken ? t('errors.emailTaken') : null)}
          </FieldError>
        </Field>
        {mode === 'login' ? (
          <Field data-invalid={Boolean(errors.password || actionData?.fieldErrors?.password)}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password" className={MOBILE_FIELD_LABEL}>
                {t('fields.password')}
              </FieldLabel>
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
              invalid={Boolean(errors.password || actionData?.fieldErrors?.password)}
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
