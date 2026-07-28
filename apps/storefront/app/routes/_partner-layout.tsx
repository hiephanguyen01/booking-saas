import { Outlet, useOutletContext } from 'react-router';
import type { StorefrontContext } from '~/root';

/** Structural layout wrapper for partner-onboarding routes.
 *  The actual standalone appearance (no SiteHeader/SiteFooter) is handled in
 *  root.tsx via the `handle.standalone` flag on the child route. */
export default function PartnerLayout() {
  const context = useOutletContext<StorefrontContext>();
  return <Outlet context={context} />;
}
