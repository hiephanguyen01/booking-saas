import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import type { PlatformHealthResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { ExpiringSubscriptionsCard } from '~/features/admin/components/expiring-subscriptions-card';
import { GmvTrendCard } from '~/features/admin/components/gmv-chart';
import { PlatformKpiCards } from '~/features/admin/components/platform-kpi-cards';
import { TenantHealthTable } from '~/features/admin/components/tenant-health-table';
import { dashboardPaths } from '~/constants/paths';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { apiPaths } from '~/constants/api-paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tổng quan nền tảng · BookingOS Admin' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requirePlatform(request, 'platform.tenants.read');
  const res = await apiGet<PlatformHealthResponse>(apiPaths.platform.health, auth);
  return { health: res.ok ? res.data : null, error: res.ok ? null : res.error };
}

export default function AdminOverview({ loaderData }: Route.ComponentProps) {
  const { health, error } = loaderData;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Tổng quan nền tảng"
        description="Sức khoẻ toàn nền tảng: GMV, tenant, tin đăng, sự kiện webhook và chi trả."
        actions={
          <Button asChild>
            <Link to={dashboardPaths.admin.tenants}>
              Quản lý tenant
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        }
      />

      <ErrorBanner
        error={error ? `Không tải được dữ liệu sức khoẻ nền tảng: ${error}` : null}
      />

      <PlatformKpiCards kpis={health?.kpis} />

      <section className="grid gap-6 lg:grid-cols-3">
        <GmvTrendCard trend={health?.gmvTrend ?? []} />
        <ExpiringSubscriptionsCard expiring={health?.expiring ?? []} />
      </section>

      <TenantHealthTable tenants={health?.tenants ?? []} error={error ?? null} />
    </div>
  );
}
