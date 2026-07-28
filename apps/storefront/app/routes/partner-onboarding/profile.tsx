import { PartnerProfilePage } from '~/features/partner-onboarding/components/partner-profile-page';
import {
  loadPartnerProfileRoute,
  submitPartnerProfileRoute,
} from '~/features/partner-onboarding/server/partner-profile-route.server';
import type { Route } from './+types/profile';
import { partnerMeta } from './shared';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  const rootData = matches[0].loaderData;
  return partnerMeta(
    rootData.kind === 'tenant' ? rootData.tenant.name : undefined,
    params.locale,
    'profile',
  );
}

export function loader({ request, params }: Route.LoaderArgs) {
  return loadPartnerProfileRoute(request, params.locale);
}

export function action({ request, params }: Route.ActionArgs) {
  return submitPartnerProfileRoute(request, params.locale);
}

export default function PartnerProfileRoute(props: Route.ComponentProps) {
  return <PartnerProfilePage {...props} />;
}
