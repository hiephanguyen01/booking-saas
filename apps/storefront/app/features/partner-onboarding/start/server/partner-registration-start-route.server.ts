import { authChallengeResponseSchema, type AuthChallengeResponse } from '@booking/contracts';
import { redirect } from 'react-router';
import { publicPost } from '../../../../lib/api.server';
import { authFlow } from '../../../../lib/auth-flow.server';
import { getOptionalAuth } from '../../../../lib/auth.server';
import { storefrontEnv } from '../../../../lib/env.server';
import { requireLocale } from '../../../../lib/i18n.server';
import { getCurrentStorefrontTenant } from '../../../../lib/request-context.server';
import {
  inferredPartnerName,
  partnerRegistrationEntry,
} from '../../server/partner-onboarding-domain';
import {
  failedPartnerFormData,
  failedPartnerOnboarding,
  invalidPartnerOnboarding,
  partnerFormFields,
  partnerStepPath,
  readPartnerFormData,
} from '../../server/partner-onboarding-shared.server';

export async function submitPartnerRegistrationStartRoute(
  request: Request,
  localeParam?: string,
) {
  const locale = requireLocale(localeParam);
  const formBody = await readPartnerFormData(request);
  if (!formBody.ok) return failedPartnerFormData(formBody);

  const auth = getOptionalAuth();
  if (auth) {
    const tenant = getCurrentStorefrontTenant();
    const entry = partnerRegistrationEntry(auth, tenant.id);
    if (entry === 'dashboard') {
      return redirect(`${storefrontEnv.dashboardUrl}/partner`);
    }
    const setCookie = await authFlow.create(request, {
      phase: 'partner_registration_profile',
      email: auth.info.user.email,
      maskedDestination: auth.info.user.email,
    });
    return redirect(partnerStepPath(locale, 'profile'), {
      headers: { 'Set-Cookie': setCookie },
    });
  }

  const form = partnerFormFields(formBody.value);
  const email = String(form.email ?? '')
    .trim()
    .toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return invalidPartnerOnboarding({ email: ['invalidEmail'] });
  }

  const result = await publicPost<AuthChallengeResponse>(
    request,
    '/auth/registration/start',
    { email, fullName: inferredPartnerName(email), locale },
    { schema: authChallengeResponseSchema },
  );
  if (!result.ok || !result.data) return failedPartnerOnboarding(result);

  const setCookie = await authFlow.create(request, {
    phase: 'partner_registration_verify',
    email,
    challengeId: result.data.challengeId,
    maskedDestination: result.data.maskedDestination,
    resendAvailableAt: Date.now() + result.data.resendAfterSec * 1_000,
  });
  return redirect(partnerStepPath(locale, 'verify'), {
    headers: { 'Set-Cookie': setCookie },
  });
}
