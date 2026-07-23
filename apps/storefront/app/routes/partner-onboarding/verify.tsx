import { PartnerVerifyPage } from '../../features/partner-onboarding/verify/partner-verify-page';
import {
  loadPartnerVerifyRoute,
  submitPartnerVerifyRoute,
} from '../../features/partner-onboarding/verify/server/partner-verify-route.server';
import type { Route } from './+types/verify';
import { partnerMeta } from './shared';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  return partnerMeta(matches[0].loaderData.tenant.name, params.locale, 'verify');
}

export function loader({ request, params }: Route.LoaderArgs) {
  return loadPartnerVerifyRoute(request, params.locale);
}

export function action({ request, params }: Route.ActionArgs) {
  return submitPartnerVerifyRoute(request, params.locale);
}

export default function PartnerVerifyRoute(props: Route.ComponentProps) {
  return <PartnerVerifyPage {...props} />;
}
