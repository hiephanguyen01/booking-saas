import {
  loginInputSchema,
  passwordResetStartInputSchema,
  registrationStartInputSchema,
} from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { useSubmissionGuard } from '@booking/ui/hooks/use-submission-guard';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigation, useSubmit } from 'react-router';
import { z } from 'zod';

export type AuthStartMode = 'register' | 'login' | 'reset';

/** The two documents `mode === 'register'` requires a tick for (§ Consent capture). */
export interface AuthStartLegalConsent {
  versionIds: string[];
  locale: Locale;
}

function createAuthStartSchema(mode: AuthStartMode) {
  return z.object({
    fullName:
      mode === 'register' ? registrationStartInputSchema.shape.fullName : z.string().optional(),
    email:
      mode === 'login'
        ? loginInputSchema.shape.email
        : mode === 'reset'
          ? passwordResetStartInputSchema.shape.email
          : registrationStartInputSchema.shape.email,
    password: mode === 'login' ? loginInputSchema.shape.password : z.string().optional(),
    // Matches the message `affiliateRegistrationSchema`/`partnerOnboardingProfileSchema`
    // already use for the same client-side consent gate (packages/contracts).
    acceptedTerms:
      mode === 'register'
        ? z.boolean().refine(Boolean, { message: 'Vui lòng đồng ý với điều khoản' })
        : z.boolean().optional(),
  });
}

type AuthStartValues = z.infer<ReturnType<typeof createAuthStartSchema>>;

export function useAuthStartFormController(
  mode: AuthStartMode,
  legalConsent?: AuthStartLegalConsent,
) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const { busy: submitting, run } = useSubmissionGuard(navigation.state);
  const schema = createAuthStartSchema(mode);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthStartValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    defaultValues: { fullName: '', email: '', password: '', acceptedTerms: false },
  });

  const submitForm = handleSubmit((values) => {
    // `acceptedTerms` is a client-only gate (registrationStartInputSchema has
    // no such field, so the server drops it); the versions it stands for are
    // what actually get recorded.
    const hasConsent = mode === 'register' && Boolean(legalConsent?.versionIds.length);
    const payload = hasConsent
      ? {
          ...values,
          acceptedVersionIds: legalConsent!.versionIds,
          acceptedLocale: legalConsent!.locale,
        }
      : values;
    run(() => submit(payload, { method: 'post' }));
  });

  return {
    control,
    errors,
    register,
    requiresConsent: mode === 'register',
    submitForm,
    submitting,
  };
}
