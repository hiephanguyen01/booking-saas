import { PartnerDonePage } from '~/features/partner-onboarding/components/partner-done-page';
import { partnerMeta } from '~/features/partner-onboarding/lib/partner-onboarding-meta';
import { loadPartnerDoneRoute } from '~/features/partner-onboarding/server/partner-done-route.server';
import type { Route } from './+types/done';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  const rootData = matches[0].loaderData;
  return partnerMeta(
    rootData.kind === 'tenant' ? rootData.tenant.name : undefined,
    params.locale,
    'done',
  );
}

export const loader = ({ request, params }: Route.LoaderArgs) =>
  loadPartnerDoneRoute(request, params.locale);

export default function PartnerDone({ loaderData }: Route.ComponentProps) {
  return <PartnerDonePage {...loaderData} />;
}
