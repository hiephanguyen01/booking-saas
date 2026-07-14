import { Outlet } from 'react-router';

/** Structural layout wrapper for partner-onboarding routes.
 *  The actual standalone appearance (no SiteHeader/SiteFooter) is handled in
 *  root.tsx via the `handle.standalone` flag on the child route. */
export default function PartnerLayout() {
  return <Outlet />;
}
