import { PartnerVerifyPage } from '../../features/partner-onboarding/verify/partner-verify-page';
import {
  loadPartnerVerifyRoute,
  submitPartnerVerifyRoute,
} from '../../features/partner-onboarding/verify/server/partner-verify-route.server';
import type { Route } from './+types/verify';
import { partnerMeta } from './shared';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  const rootData = matches[0].loaderData;
  return partnerMeta(
    rootData.kind === 'tenant' ? rootData.tenant.name : undefined,
    params.locale,
    'verify',
  );
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
