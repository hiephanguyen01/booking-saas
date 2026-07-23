import { AffiliateApplicationPage } from '../features/affiliate/application/affiliate-application-page';
import {
  loadAffiliateApplicationRoute,
  submitAffiliateApplication,
} from '../features/affiliate/application/server/affiliate-application-route.server';
import type { Route } from './+types/become-affiliate';
import { partnerMeta } from './partner-onboarding/shared';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  return partnerMeta(matches[0].loaderData.tenant.name, params.locale, 'affiliate');
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
