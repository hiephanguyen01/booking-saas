import { NavLink, Outlet, redirect, useSearchParams } from 'react-router';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { cn } from '@booking/ui/lib/utils';
import { Share2 } from 'lucide-react';
import type { Route } from './+types/_layout';
import { requireAffiliate } from '~/features/affiliate/server/affiliate.server';
import { fetchPendingLegalAcceptances } from '~/features/legal/server/legal.server';
import { affiliateTabs } from './nav';
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
  };
}

export default function AffiliateLayout({ loaderData }: Route.ComponentProps) {
  const { memberships, active } = loaderData;
  const [sp] = useSearchParams();
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

  const tenantQuery = sp.get('tenant');
  const withTenant = (to: string) => (tenantQuery ? `${to}?tenant=${tenantQuery}` : to);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cộng tác viên</h1>
          <p className="text-sm text-muted-foreground">{active.tenantName}</p>
        </div>
        {approved.length > 1 ? (
          <Card className="w-fit">
            <CardContent className="flex items-center gap-2 p-2">
              <span className="text-xs text-muted-foreground">Tenant:</span>
              {approved.map((m) => (
                <NavLink
                  key={m.tenantId}
                  to={`/affiliate?tenant=${m.tenantId}`}
                  className={cn(
                    'rounded px-2 py-1 text-xs',
                    m.tenantId === active.tenantId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {m.tenantName}
                </NavLink>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <nav className="flex gap-1 border-b border-border">
        {affiliateTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={withTenant(tab.to)}
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
