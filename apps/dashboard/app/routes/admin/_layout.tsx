import { Outlet } from 'react-router';
import type { Route } from './+types/_layout';
import { requireScope } from '~/lib/auth.server';

/** Guards the platform-admin area; exposes the platform membership to children. */
export async function loader({ request }: Route.LoaderArgs) {
  const { info } = await requireScope(request, 'platform');
  const membership = info.scopes.find((scope) => scope.scope === 'platform') ?? null;
  return { user: info.user, membership };
}

export default function AdminLayout() {
  return <Outlet />;
}
