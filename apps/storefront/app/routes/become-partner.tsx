import { PartnerRegistrationStartPage } from '../features/partner-onboarding/start/partner-registration-start-page';
import { submitPartnerRegistrationStartRoute } from '../features/partner-onboarding/start/server/partner-registration-start-route.server';
import type { Route } from './+types/become-partner';
import { partnerMeta } from './partner-onboarding/shared';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  const rootData = matches[0].loaderData;
  return partnerMeta(
    rootData.kind === 'tenant' ? rootData.tenant.name : undefined,
    params.locale,
    'start',
  );
}

export function action({ request, params }: Route.ActionArgs) {
  return submitPartnerRegistrationStartRoute(request, params.locale);
}

export default function PartnerRegistrationStartRoute() {
  return <PartnerRegistrationStartPage />;
}
