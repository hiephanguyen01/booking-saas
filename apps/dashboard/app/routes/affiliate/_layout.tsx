import { NavLink, Outlet, redirect } from 'react-router';
import { cn } from '@booking/ui/lib/utils';
import { ExternalLink, Share2 } from 'lucide-react';
import type { Route } from './+types/_layout';
import { requireAffiliate } from '~/features/affiliate/server/affiliate.server';
import { fetchPendingLegalAcceptances } from '~/features/legal/server/legal.server';
import { affiliateTabs } from './nav';
import { dashboardEnv } from '~/lib/env.server';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Cộng tác viên · BookingOS' }];
}

/**
 * Every affiliate screen shares this loader, so it is the one place that
 * redirects to the legal re-acceptance interstitial (Task 16) whenever
 * apiPaths.me.legalPending is non-empty for the active membership. Skipped when
 * there is no approved `active` membership (nothing to accept terms for) and
 * on the interstitial path itself — that route re-checks in its own loader
 * and redirects away once nothing is pending, so checking here too would
 * bounce the user back to this exact page forever.
 */
export async function loader({ request }: Route.LoaderArgs) {
  // `requireAffiliate` 404s/redirects off a non-tenant host before touching
  // auth — see its comment (features/affiliate/server/affiliate.server.ts) for
  // why the check lives there and not here.
  const { memberships, active, auth } = await requireAffiliate(request);

  const { pathname } = new URL(request.url);
  if (active && pathname !== dashboardPaths.affiliate.legalUpdate) {
    const pending = await fetchPendingLegalAcceptances(auth);
    // Fail open on a transient error reading the pending list.
    if (pending.ok && (pending.data?.length ?? 0) > 0) {
      throw redirect(dashboardPaths.affiliate.legalUpdate);
    }
  }

  return {
    memberships: memberships.map((m) => ({ tenantId: m.tenantId, tenantName: m.tenantName, status: m.status })),
    active: active ? { tenantId: active.tenantId, tenantName: active.tenantName } : null,
    // Switching tenants now means switching hosts, so the only place that can
    // list them all is the directory on the platform console.
    platformConsoleUrl: dashboardEnv.dashboardUrl,
  };
}

export default function AffiliateLayout({ loaderData }: Route.ComponentProps) {
  const { memberships, active, platformConsoleUrl } = loaderData;
  const approved = memberships.filter((m) => m.status === 'approved');

  if (!active) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Share2 className="mx-auto mb-4 size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Chưa có tài khoản cộng tác viên</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {memberships.length > 0
            ? 'Yêu cầu cộng tác viên của bạn đang chờ được duyệt. Vui lòng quay lại sau khi được duyệt.'
            : 'Bạn chưa đăng ký làm cộng tác viên. Hãy đăng ký trên trang cửa hàng của tenant.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cộng tác viên</h1>
          <p className="text-sm text-muted-foreground">{active.tenantName}</p>
        </div>
        {/* Each tenant's portal lives on that tenant's own console host, so
            switching is a cross-origin move — a plain <a>, and the directory on
            the platform console is the only page that can list them all. This
            replaced a `?tenant=` selector that stopped working when the affiliate
            area became host-scoped: the param was still rendered but ignored. */}
        {approved.length > 1 ? (
          <a
            href={`${platformConsoleUrl}${dashboardPaths.workspaces}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Đổi tenant ({approved.length})
          </a>
        ) : null}
      </div>

      <nav className="flex gap-1 border-b border-border">
        {affiliateTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
