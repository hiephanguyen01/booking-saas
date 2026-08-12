import { redirect } from 'react-router';
import type { AffiliateResponse } from '@booking/contracts';
import type { Route } from './+types/home';
import { apiGet } from '~/lib/api.server';
import { requireSessionInfo } from '~/lib/auth.server';
import { getCurrentDashboardHost } from '~/lib/request-auth.server';
import { defaultDashboardPath } from '~/lib/workspace';
import { apiPaths } from '~/constants/api-paths';
import { dashboardPaths } from '~/constants/paths';

/**
 * Dashboard entrypoint: send the user to their highest-privilege area for the
 * current host. On the platform host that is `/admin` (platform scope) or the
 * `/workspaces` directory (everyone else); on a tenant host, their tenant or
 * partner area, and failing those their affiliate portal. A logged-in user with
 * no membership of any kind sees the no-access notice below.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = await requireSessionInfo(request);
  const host = getCurrentDashboardHost();
  const area = defaultDashboardPath(ctx.info, host);
  if (area !== '/') throw redirect(area);

  // Affiliates are membership-gated rather than an RBAC scope, so they never
  // appear in `info.scopes` and `defaultDashboardPath` — which is synchronous —
  // structurally cannot see them. Without this an affiliate-only user signing in
  // on their tenant's console lands on the no-access notice while `/affiliate`
  // sits there working, reachable only by typing it.
  //
  // Only a tenant host gets here: on the platform host `defaultDashboardPath`
  // always returns `/admin` or `/workspaces`, so the redirect above has fired.
  if (host.kind === 'tenant') {
    const result = await apiGet<AffiliateResponse[]>(apiPaths.affiliate.me, {
      token: ctx.user.accessToken,
    });
    // Fail open to the notice on a transient read error, as `requireAffiliate`
    // does — a stranded affiliate is better than a 500 on the landing route.
    const belongsHere = (result.ok ? (result.data ?? []) : []).some(
      (membership) =>
        membership.status === 'approved' && membership.tenantId === host.tenant.id,
    );
    if (belongsHere) throw redirect(dashboardPaths.affiliate.home);
  }

  return { fullName: ctx.info.user.fullName };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-md space-y-2 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Xin chào, {loaderData.fullName}</h1>
      <p className="text-muted-foreground">
        Tài khoản của bạn chưa được gán vào khu vực quản trị nào. Vui lòng liên hệ quản trị viên để
        được cấp quyền.
      </p>
    </div>
  );
}
