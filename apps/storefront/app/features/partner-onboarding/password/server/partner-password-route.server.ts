import {
  authFlowCompleteResponseSchema,
  authPasswordCompleteInputSchema,
  type AuthFlowCompleteResponse,
} from '@booking/contracts';
import { z } from 'zod';
import { backendLogin, publicPost } from '../../../../lib/api.server';
import { authFlow } from '../../../../lib/auth-flow.server';
import { requireLocale } from '../../../../lib/i18n.server';
import { suppressStorefrontSessionCommit } from '../../../../lib/request-context.server';
import { createUserSession } from '../../../../lib/session.server';
import {
  failedPartnerOnboarding,
  invalidPartnerOnboarding,
  partnerFormFields,
  partnerStepPath,
  requirePartnerPhase,
  requirePartnerPhaseOnly,
} from '../../server/partner-onboarding-shared.server';

const partnerPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'passwordTooShort')
    .max(128, 'passwordTooLong')
    .regex(/[A-Za-z]/, 'passwordNoLetter')
    .regex(/[0-9]/, 'passwordNoDigit')
    .regex(/[A-Z]/, 'passwordNoUppercase')
    .regex(/[^A-Za-z0-9]/, 'passwordNoSpecial'),
});

export function loadPartnerPasswordRoute(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  return requirePartnerPhaseOnly(request, 'partner_registration_password', locale);
}

export async function submitPartnerPasswordRoute(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const flow = await requirePartnerPhase(request, 'partner_registration_password', locale);
  const form = partnerFormFields(await request.formData());

  if (form.password !== form.confirmPassword) {
    return invalidPartnerOnboarding({ confirmPassword: ['passwordMismatch'] });
  }
  const local = partnerPasswordSchema.safeParse({ password: form.password });
  if (!local.success) {
    return invalidPartnerOnboarding(local.error.flatten().fieldErrors);
  }
  const parsed = authPasswordCompleteInputSchema.safeParse({
    completionToken: flow.record.completionToken,
    password: form.password,
  });
  if (!parsed.success) {
    return invalidPartnerOnboarding(parsed.error.flatten().fieldErrors);
  }

  const completed = await publicPost<AuthFlowCompleteResponse>(
    request,
    '/auth/registration/complete',
    parsed.data,
    { schema: authFlowCompleteResponseSchema },
  );
  if (!completed.ok || !completed.data) return failedPartnerOnboarding(completed);

  const login = await backendLogin(request, {
    email: flow.record.email ?? '',
    password: String(form.password),
  });
  if (!login.ok || !login.tokens || !login.user) return failedPartnerOnboarding(login);

  await authFlow.update(flow.id, {
    phase: 'partner_registration_profile',
    email: flow.record.email,
    maskedDestination: flow.record.maskedDestination,
  });
  suppressStorefrontSessionCommit();
  return createUserSession(
    request,
    { ...login.tokens, userId: login.user.id },
    partnerStepPath(locale, 'profile'),
  );
}
