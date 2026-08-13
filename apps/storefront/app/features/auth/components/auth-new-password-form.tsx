import { passwordSchema } from '@booking/contracts';
import { Field, FieldError, FieldGroup, FieldLabel } from '@booking/ui/components/ui/field';
import { useSubmissionGuard } from '@booking/ui/hooks/use-submission-guard';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigation, useSubmit } from 'react-router';
import { z } from 'zod';
import type { AuthActionData } from '~/lib/auth-types';
import { NsI18n, useTranslation } from '@booking/i18n';
import { AuthFormError, AuthPasswordInput, AuthSubmitButton } from './auth-form-controls';
import { AuthPasswordGuidance } from './auth-password-guidance';

const MOBILE_FIELD_LABEL =
  'max-md:text-xs max-md:font-bold max-md:uppercase max-md:tracking-[0.06em] max-md:text-muted-foreground';

export function NewPasswordForm({
  mode,
  actionData,
}: {
  mode: 'registration' | 'reset';
  actionData?: AuthActionData;
}) {
  const { t } = useTranslation(NsI18n.Auth);
  const submit = useSubmit();
  const navigation = useNavigation();
  const { busy: submitting, run } = useSubmissionGuard(navigation.state);
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
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    defaultValues: { password: '', confirmPassword: '' },
  });
  const password = useWatch({ control, name: 'password', defaultValue: '' });
  const submitForm = handleSubmit((values) => {
    run(() => submit(values, { method: 'post' }));
  });

  return (
    <form method="post" onSubmit={submitForm} noValidate aria-busy={submitting}>
      <FieldGroup className="gap-4 md:gap-5">
        <AuthFormError actionData={actionData} />
        <Field data-invalid={Boolean(errors.password || actionData?.fieldErrors?.password)}>
          <FieldLabel htmlFor="password" className={MOBILE_FIELD_LABEL}>
            {t('password.label')}
          </FieldLabel>
          <AuthPasswordInput
            id="password"
            autoComplete="new-password"
            registration={register('password')}
            invalid={Boolean(errors.password || actionData?.fieldErrors?.password)}
            disabled={submitting}
            describedBy="auth-password-guidance"
          />
          <FieldError errors={[errors.password]}>
            {actionData?.fieldErrors?.password?.[0]}
          </FieldError>
          <AuthPasswordGuidance id="auth-password-guidance" password={password} />
        </Field>
        <Field
          data-invalid={Boolean(errors.confirmPassword || actionData?.fieldErrors?.confirmPassword)}
        >
          <FieldLabel htmlFor="confirmPassword" className={MOBILE_FIELD_LABEL}>
            {t('password.confirm')}
          </FieldLabel>
          <AuthPasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            registration={register('confirmPassword')}
            invalid={Boolean(errors.confirmPassword || actionData?.fieldErrors?.confirmPassword)}
            disabled={submitting}
          />
          <FieldError errors={[errors.confirmPassword]}>
            {errors.confirmPassword?.message ??
              (actionData?.fieldErrors?.confirmPassword?.[0] ? t('errors.passwordMismatch') : null)}
          </FieldError>
        </Field>
        <AuthSubmitButton disabled={submitting}>
          {mode === 'registration' ? t('password.submitRegistration') : t('password.submitReset')}
        </AuthSubmitButton>
      </FieldGroup>
    </form>
  );
}
