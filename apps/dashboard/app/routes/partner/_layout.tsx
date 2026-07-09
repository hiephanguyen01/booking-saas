import { Outlet } from 'react-router';
import type { Route } from './+types/_layout';
import { requireScope } from '~/lib/auth.server';

/** Guards the partner area; exposes the (first) partner membership to children. */
export async function loader({ request }: Route.LoaderArgs) {
  const { info } = await requireScope(request, 'partner');
  const membership = info.scopes.find((scope) => scope.scope === 'partner') ?? null;
  return { user: info.user, membership };
}

export default function PartnerLayout() {
  return <Outlet />;
}
