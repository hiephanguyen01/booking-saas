import { PartnerPasswordPage } from '~/features/partner-onboarding/components/partner-password-page';
import {
  loadPartnerPasswordRoute,
  submitPartnerPasswordRoute,
} from '~/features/partner-onboarding/server/partner-password-route.server';
import type { Route } from './+types/password';
import { partnerMeta } from '~/features/partner-onboarding/lib/partner-onboarding-meta';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  const rootData = matches[0].loaderData;
  return partnerMeta(
    rootData.kind === 'tenant' ? rootData.tenant.name : undefined,
    params.locale,
    'password',
  );
}

export function loader({ request, params }: Route.LoaderArgs) {
  return loadPartnerPasswordRoute(request, params.locale);
}

export function action({ request, params }: Route.ActionArgs) {
  return submitPartnerPasswordRoute(request, params.locale);
}

export default function PartnerPasswordRoute() {
  return <PartnerPasswordPage />;
}
