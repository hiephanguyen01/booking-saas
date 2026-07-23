import {
  loginInputSchema,
  passwordResetStartInputSchema,
  registrationStartInputSchema,
} from '@booking/contracts';
import { Field, FieldError, FieldGroup, FieldLabel } from '@booking/ui/components/ui/field';
import { Input } from '@booking/ui/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, UserRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useSubmit } from 'react-router';
import { z } from 'zod';
import type { AuthActionData } from '../../../lib/auth-types';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import { AuthFormError, AuthPasswordInput, AuthSubmitButton } from './auth-form-controls';

export function StartForm({
  mode,
  locale,
  actionData,
}: {
  mode: 'register' | 'login' | 'reset';
  locale: 'vi' | 'en';
  actionData?: AuthActionData;
}) {
  const { t } = useTranslation(NsI18n.Auth);
  const submit = useSubmit();
  const schema = z.object({
    fullName:
      mode === 'register' ? registrationStartInputSchema.shape.fullName : z.string().optional(),
    email:
      mode === 'login'
        ? loginInputSchema.shape.email
        : mode === 'reset'
          ? passwordResetStartInputSchema.shape.email
          : registrationStartInputSchema.shape.email,
    password: mode === 'login' ? loginInputSchema.shape.password : z.string().optional(),
  });
  type Values = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    defaultValues: { fullName: '', email: '', password: '' },
  });

  return (
    <form onSubmit={handleSubmit((values) => submit(values, { method: 'post' }))} noValidate>
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
            />
            <FieldError errors={[errors.password]}>
              {actionData?.fieldErrors?.password?.[0]}
            </FieldError>
          </Field>
        ) : null}
        <AuthSubmitButton>
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
