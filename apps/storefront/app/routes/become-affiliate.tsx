import { AffiliateApplicationPage } from '../features/affiliate/application/affiliate-application-page';
import {
  loadAffiliateApplicationRoute,
  submitAffiliateApplication,
} from '../features/affiliate/application/server/affiliate-application-route.server';
import type { Route } from './+types/become-affiliate';
import { partnerMeta } from './partner-onboarding/shared';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  const rootData = matches[0].loaderData;
  return partnerMeta(
    rootData.kind === 'tenant' ? rootData.tenant.name : undefined,
    params.locale,
    'affiliate',
  );
}

/** Tells root.tsx to hide the SiteHeader and SiteFooter on this page. */
export const handle = { standalone: true };

export function loader() {
  return loadAffiliateApplicationRoute();
}

export function action({ request }: Route.ActionArgs) {
  return submitAffiliateApplication(request);
}

export default function BecomeAffiliateRoute(props: Route.ComponentProps) {
  return <AffiliateApplicationPage {...props} />;
}
