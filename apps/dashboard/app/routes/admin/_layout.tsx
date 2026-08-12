import { Outlet } from 'react-router';
import type { Route } from './+types/_layout';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { requirePlatform } from '~/features/admin/server/admin.server';

/**
 * Guards the platform-admin area; exposes the platform membership to children.
 * `requirePlatform` 404s off a non-platform host before it even checks auth —
 * this area does not exist on a tenant console host, full stop (unlike
 * tenant/partner/affiliate, which redirect a signed-in caller to their own
 * directory instead — platform scope has no such same-host destination on a
 * tenant console).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { ctx, membership } = await requirePlatform(request);
  return { user: ctx.info.user, membership };
}

export default function AdminLayout() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorState error={error} homeHref="/admin" homeLabel="Về quản trị nền tảng" />;
}
