import { Outlet } from 'react-router';
import type { Route } from './+types/_layout';
import { requirePartner } from './partner.server';

/** Guards the partner area; exposes the (first) partner membership to children. */
export async function loader({ request }: Route.LoaderArgs) {
  const { membership } = await requirePartner(request);
  return { membership };
}

export default function PartnerLayout() {
  return <Outlet />;
}
