import { passwordSchema } from '@booking/contracts';
import { Field, FieldError, FieldGroup, FieldLabel } from '@booking/ui/components/ui/field';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useSubmit } from 'react-router';
import { z } from 'zod';
import type { AuthActionData } from '../../../lib/auth-types';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { AuthFormError, AuthPasswordInput, AuthSubmitButton } from './auth-form-controls';

export function NewPasswordForm({
  mode,
  actionData,
}: {
  mode: 'registration' | 'reset';
  actionData?: AuthActionData;
}) {
  const { t } = useTranslation(NsI18n.Auth);
  const submit = useSubmit();
  const schema = z
    .object({
      password: passwordSchema,
      confirmPassword: z.string(),
    })
    .refine((value) => value.password === value.confirmPassword, {
      path: ['confirmPassword'],
      message: t('errors.passwordMismatch'),
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
    defaultValues: { password: '', confirmPassword: '' },
  });

  return (
    <form onSubmit={handleSubmit((values) => submit(values, { method: 'post' }))} noValidate>
      <FieldGroup className="gap-5">
        <AuthFormError actionData={actionData} />
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">{t('password.label')}</FieldLabel>
          <AuthPasswordInput
            id="password"
            autoComplete="new-password"
            registration={register('password')}
            invalid={Boolean(errors.password)}
          />
          <FieldError errors={[errors.password]}>
            {actionData?.fieldErrors?.password?.[0]}
          </FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.confirmPassword)}>
          <FieldLabel htmlFor="confirmPassword">{t('password.confirm')}</FieldLabel>
          <AuthPasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            registration={register('confirmPassword')}
            invalid={Boolean(errors.confirmPassword)}
          />
          <FieldError errors={[errors.confirmPassword]}>
            {errors.confirmPassword?.message ??
              (actionData?.fieldErrors?.confirmPassword?.[0] ? t('errors.passwordMismatch') : null)}
          </FieldError>
        </Field>
        <AuthSubmitButton>
          {mode === 'registration' ? t('password.submitRegistration') : t('password.submitReset')}
        </AuthSubmitButton>
      </FieldGroup>
    </form>
  );
}
