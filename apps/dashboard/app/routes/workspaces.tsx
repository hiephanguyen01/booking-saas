import { Link } from 'react-router';
import { Building2, Store } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import type { Route } from './+types/workspaces';
import { requireSessionInfo } from '~/lib/auth.server';
import { dashboardPaths } from '~/lib/paths';
import {
  findPartnerMembership,
  findTenantMembership,
} from '~/lib/workspace';

export async function loader({ request }: Route.LoaderArgs) {
  const { info } = await requireSessionInfo(request);
  const tenants = info.scopes.flatMap((membership) => {
    if (membership.scope !== 'tenant' || !membership.tenantId) return [];
    const tenant = findTenantMembership(info, membership.tenantId);
    return tenant ? [tenant] : [];
  });
  const partners = info.scopes.flatMap((membership) => {
    if (membership.scope !== 'partner' || !membership.partnerId) return [];
    const partner = findPartnerMembership(info, membership.partnerId);
    return partner ? [partner] : [];
  });
  return { tenants, partners };
}

export default function Workspaces({ loaderData }: Route.ComponentProps) {
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chọn không gian làm việc</h1>
        <p className="text-muted-foreground">
          Mỗi đường dẫn sử dụng đúng quyền của tenant hoặc partner đã chọn.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {loaderData.tenants.map((membership) => (
          <Link key={`tenant:${membership.tenantId}`} to={dashboardPaths.tenant.home(membership.tenantId)}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader className="flex-row items-center gap-3">
                <Building2 className="size-5" />
                <CardTitle>{membership.tenantName ?? 'Tenant'}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">Tenant workspace</CardContent>
            </Card>
          </Link>
        ))}
        {loaderData.partners.map((membership) => (
          <Link key={`partner:${membership.partnerId}`} to={dashboardPaths.partner.home(membership.partnerId)}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader className="flex-row items-center gap-3">
                <Store className="size-5" />
                <CardTitle>{membership.partnerName ?? 'Partner'}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {membership.tenantName ?? 'Partner workspace'}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
