import { partnerOnboardingProfileSchema } from '@booking/contracts';
import { redirect } from 'react-router';
import { loadAdministrativeProvinces } from '~/lib/administrative-divisions.server';
import { authFlow } from '~/lib/auth-flow.server';
import { requireAuth } from '~/lib/auth.server';
import { requireLocale } from '~/lib/i18n.server';
import { readJsonRequestBody } from '~/lib/json-request.server';
import { applyAsPartner } from '~/lib/partner.server';
import { getCurrentStorefrontTenant } from '~/lib/request-context.server';
import { partnerApplyPayloadFor } from '~/features/partner-onboarding/server/partner-onboarding-domain';
import {
  failedPartnerOnboarding,
  invalidPartnerOnboarding,
  partnerStartPath,
  partnerStepPath,
  requirePartnerPhase,
} from '~/features/partner-onboarding/server/partner-onboarding-shared.server';

export async function loadPartnerProfileRoute(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  await requirePartnerPhase(request, 'partner_registration_profile', locale);
  const auth = requireAuth(partnerStartPath(locale));
  const tenant = getCurrentStorefrontTenant();
  const provinces = await loadAdministrativeProvinces(request);
  return { email: auth.info.user.email, tenantName: tenant.name, provinces };
}

export async function submitPartnerProfileRoute(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const flow = await requirePartnerPhase(request, 'partner_registration_profile', locale);
  const auth = requireAuth(partnerStartPath(locale));
  const tenant = getCurrentStorefrontTenant();

  const body = await readJsonRequestBody(request);
  if (!body.ok) {
    return failedPartnerOnboarding({
      status: body.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400,
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
  return redirect(partnerStepPath(locale, 'done'));
}
