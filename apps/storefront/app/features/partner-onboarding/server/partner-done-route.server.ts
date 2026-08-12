import { requireLocale } from '~/lib/server/i18n.server';
import { getCurrentStorefrontTenant } from '~/lib/server/request-context.server';
import { tenantDashboardOrigin } from '~/lib/server/tenant.server';
import { requirePartnerPhase } from '~/features/partner-onboarding/server/partner-onboarding-shared.server';

export async function loadPartnerDoneRoute(request: Request, localeParam?: string) {
  const locale = requireLocale(localeParam);
  const flow = await requirePartnerPhase(request, 'partner_registration_done', locale);
  return {
    maskedEmail: flow.record.maskedDestination ?? flow.record.email ?? '',
    dashboardUrl: tenantDashboardOrigin(getCurrentStorefrontTenant()),
  };
}
