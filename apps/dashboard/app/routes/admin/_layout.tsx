import { Outlet } from 'react-router';
import type { Route } from './+types/_layout';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorState error={error} homeHref="/admin" homeLabel="Về quản trị nền tảng" />;
}
