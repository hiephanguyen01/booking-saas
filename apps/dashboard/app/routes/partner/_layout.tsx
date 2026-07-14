import { Outlet } from 'react-router';
import type { Route } from './+types/_layout';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { requirePartner } from './partner.server';

/** Guards the partner area; exposes the (first) partner membership to children. */
export async function loader({ request }: Route.LoaderArgs) {
  const { membership } = await requirePartner(request);
  return { membership };
}

export default function PartnerLayout() {
  return <Outlet />;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const homeHref = params.partnerId
    ? `/partner/${encodeURIComponent(params.partnerId)}`
    : '/workspaces';
  return <RouteErrorState error={error} homeHref={homeHref} homeLabel="Về partner" />;
}
