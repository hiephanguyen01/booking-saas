import {
  authChallengeResponseSchema,
  authOtpVerifiedResponseSchema,
  authOtpVerifyInputSchema,
  type AuthChallengeResponse,
  type AuthOtpVerifiedResponse,
} from '@booking/contracts';
import { storefrontPaths } from '~/constants/paths';
import { data, redirect } from 'react-router';
import { publicPost } from '~/lib/server/api.server';
import { authFlow } from '~/features/auth/server/auth-flow.server';
import { requireLocale } from '~/lib/server/i18n.server';
import {
  failedPartnerFormData,
  failedPartnerOnboarding,
  invalidPartnerOnboarding,
  readPartnerFormData,
  requirePartnerPhase,
  requirePartnerView,
} from '~/features/partner-onboarding/server/partner-onboarding-shared.server';
import { apiPaths } from '~/constants/api-paths';

export function loadPartnerVerifyRoute(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  return requirePartnerView(request, 'partner_registration_verify', locale);
}

export async function submitPartnerVerifyRoute(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const flow = await requirePartnerPhase(request, 'partner_registration_verify', locale);
  const formBody = await readPartnerFormData(request);
  if (!formBody.ok) return failedPartnerFormData(formBody);
  const form = formBody.value;

  if (form.get('intent') === 'resend') {
    if (flow.resendAfterSec > 0) {
      return data({ resendAfterSec: flow.resendAfterSec }, { status: 429 });
    }

    const result = await publicPost<AuthChallengeResponse>(
      request,
      apiPaths.auth.registrationResend,
      { challengeId: flow.record.challengeId },
      { schema: authChallengeResponseSchema },
    );
    if (!result.ok || !result.data) return failedPartnerOnboarding(result);
    await authFlow.update(flow.id, {
      ...flow.record,
      maskedDestination: result.data.maskedDestination,
      resendAvailableAt: Date.now() + result.data.resendAfterSec * 1_000,
    });
    return data({ resendAfterSec: result.data.resendAfterSec });
  }

  const parsed = authOtpVerifyInputSchema.safeParse({
    challengeId: flow.record.challengeId,
    code: form.get('code'),
  });
  if (!parsed.success) {
    return invalidPartnerOnboarding(parsed.error.flatten().fieldErrors);
  }

  const result = await publicPost<AuthOtpVerifiedResponse>(
    request,
    apiPaths.auth.registrationVerify,
    parsed.data,
    { schema: authOtpVerifiedResponseSchema },
  );
  if (!result.ok || !result.data) return failedPartnerOnboarding(result);

  await authFlow.update(flow.id, {
    phase: 'partner_registration_password',
    email: flow.record.email,
    maskedDestination: flow.record.maskedDestination,
    completionToken: result.data.completionToken,
  });
  return redirect(storefrontPaths.becomePartnerStep(locale, 'password'));
}
