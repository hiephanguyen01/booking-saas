import { Outlet, redirect } from 'react-router';
import type { Route } from './+types/_layout';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { requirePartner } from '~/features/partner/server/partner.server';
import { fetchPendingLegalAcceptances } from '~/features/legal/server/legal.server';
import { getOptionalUser } from '~/lib/auth.server';
import { getCurrentDashboardHost } from '~/lib/request-auth.server';
import { dashboardPaths } from '~/constants/paths';

/**
 * Guards the partner area; exposes the (first) partner membership to children.
 * Also redirects to the legal re-acceptance interstitial (Task 16) whenever
 * apiPaths.me.legalPending is non-empty — every partner screen shares this loader,
 * so this is the one place that needs to know about it. The interstitial path
 * itself is exempt: it re-checks in its own loader and redirects away once
 * there's nothing pending, so checking here too would bounce the partner back
 * to this exact page forever instead of letting them land on it.
 */
export async function loader({ request }: Route.LoaderArgs) {
  // This area lives only on a tenant console host. The platform host bounces a
  // signed-in caller to their own directory (same-origin, leaks nothing beyond
  // their own memberships); an anonymous one 404s like any other wrong-host path,
  // so the directory can't be used to probe which areas exist.
  if (getCurrentDashboardHost().kind === 'platform') {
    throw (await getOptionalUser(request))
      ? redirect(dashboardPaths.workspaces)
      : new Response('Không tìm thấy trang.', { status: 404 });
  }

  const { auth, membership } = await requirePartner(request);

  const { pathname } = new URL(request.url);
  if (pathname !== dashboardPaths.partner.legalUpdate) {
    const pending = await fetchPendingLegalAcceptances(auth);
    // Fail open on a transient error reading the pending list — a broken
    // check must not brick the entire partner portal.
    if (pending.ok && (pending.data?.length ?? 0) > 0) {
      throw redirect(dashboardPaths.partner.legalUpdate);
    }
  }

  return { membership };
}

export default function PartnerLayout() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorState error={error} homeHref="/partner" homeLabel="Về partner" />;
}
