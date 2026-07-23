import { PartnerProfilePage } from '../../features/partner-onboarding/profile/partner-profile-page';
import {
  loadPartnerProfileRoute,
  submitPartnerProfileRoute,
} from '../../features/partner-onboarding/profile/server/partner-profile-route.server';
import type { Route } from './+types/profile';
import { partnerMeta } from './shared';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  return partnerMeta(matches[0].loaderData.tenant.name, params.locale, 'profile');
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
