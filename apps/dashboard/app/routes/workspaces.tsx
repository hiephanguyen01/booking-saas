import { Link } from 'react-router';
import { Building2, Store } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import type { Route } from './+types/workspaces';
import { requireSessionInfo } from '~/lib/auth.server';
import { dashboardPaths } from '~/lib/paths';
import { firstPartnerMembership, firstTenantMembership } from '~/lib/workspace';

export async function loader({ request }: Route.LoaderArgs) {
  const { info } = await requireSessionInfo(request);
  const tenants = [firstTenantMembership(info)].filter((membership) => membership !== null);
  const partners = [firstPartnerMembership(info)].filter((membership) => membership !== null);
  return { tenants, partners };
}

export default function Workspaces({ loaderData }: Route.ComponentProps) {
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chọn không gian làm việc</h1>
        <p className="text-muted-foreground">Chọn khu vực tenant hoặc partner bạn muốn truy cập.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {loaderData.tenants.map((membership) => (
          <Link key={`tenant:${membership.tenantId}`} to={dashboardPaths.tenant.home}>
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
          <Link key={`partner:${membership.partnerId}`} to={dashboardPaths.partner.home}>
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
