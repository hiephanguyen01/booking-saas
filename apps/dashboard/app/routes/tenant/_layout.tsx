import { Outlet } from 'react-router';
import type { Route } from './+types/_layout';
import { requireScope } from '~/lib/auth.server';

/** Guards the tenant area; exposes the (first) tenant membership to children. */
export async function loader({ request }: Route.LoaderArgs) {
  const { info } = await requireScope(request, 'tenant');
  const membership = info.scopes.find((scope) => scope.scope === 'tenant') ?? null;
  return { user: info.user, membership };
}

export default function TenantLayout() {
  return <Outlet />;
}
