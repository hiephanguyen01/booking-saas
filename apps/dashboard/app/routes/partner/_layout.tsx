import { Outlet } from 'react-router';
import type { Route } from './+types/_layout';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { requirePartner } from '~/features/partner/server/partner.server';

/** Guards the partner area; exposes the (first) partner membership to children. */
export async function loader({ request }: Route.LoaderArgs) {
  const { membership } = await requirePartner(request);
  return { membership };
}

export default function PartnerLayout() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorState error={error} homeHref="/partner" homeLabel="Về partner" />;
}
