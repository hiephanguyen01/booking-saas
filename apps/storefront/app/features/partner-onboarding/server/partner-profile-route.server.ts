import { partnerOnboardingProfileSchema } from '@booking/contracts';
import { requestBodyFailureStatus } from '~/lib/server/request-body.server';
import { storefrontPaths } from '~/constants/paths';
import { redirect } from 'react-router';
import { loadAdministrativeProvinces } from '~/lib/server/administrative-divisions.server';
import { authFlow } from '~/features/auth/server/auth-flow.server';
import { requireAuth } from '~/lib/server/auth.server';
import { requireLocale } from '~/lib/server/i18n.server';
import { readJsonRequestBody } from '~/lib/server/json-request.server';
import { applyAsPartner } from '~/features/partner-onboarding/server/partner.server';
import { getCurrentStorefrontTenant } from '~/lib/server/request-context.server';
import { partnerApplyPayloadFor } from '~/features/partner-onboarding/server/partner-onboarding-domain';
import {
  failedPartnerOnboarding,
  invalidPartnerOnboarding,
  requirePartnerPhase,
} from '~/features/partner-onboarding/server/partner-onboarding-shared.server';

export async function loadPartnerProfileRoute(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  await requirePartnerPhase(request, 'partner_registration_profile', locale);
  const auth = requireAuth(storefrontPaths.becomePartner(locale));
  const tenant = getCurrentStorefrontTenant();
  const provinces = await loadAdministrativeProvinces(request);
  return { email: auth.info.user.email, tenantName: tenant.name, provinces };
}

export async function submitPartnerProfileRoute(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const flow = await requirePartnerPhase(request, 'partner_registration_profile', locale);
  const auth = requireAuth(storefrontPaths.becomePartner(locale));
  const tenant = getCurrentStorefrontTenant();

  const body = await readJsonRequestBody(request);
  if (!body.ok) {
    return failedPartnerOnboarding({
      status: requestBodyFailureStatus(body.code),
      code: body.code,
    });
  }

  const parsed = partnerOnboardingProfileSchema.safeParse(body.value);
  if (!parsed.success) {
    return invalidPartnerOnboarding(parsed.error.flatten().fieldErrors);
  }

  const payload = partnerApplyPayloadFor(parsed.data, tenant.id, auth.session.userId);
  const applied = await applyAsPartner(request, auth.session.accessToken, payload);
  if (!applied.ok) return failedPartnerOnboarding(applied);

  await authFlow.update(flow.id, {
    phase: 'partner_registration_done',
    email: flow.record.email,
    maskedDestination: flow.record.maskedDestination,
  });
  return redirect(storefrontPaths.becomePartnerStep(locale, 'done'));
}
