import {
  AlertTriangle,
  Banknote,
  Building2,
  ListChecks,
  TrendingUp,
} from 'lucide-react';
import type { PlatformHealthResponse } from '@booking/contracts';
import { formatNumber, formatVnd } from '~/lib/format';
import { StatCard } from '~/components/stat-card';

const EMPTY_KPIS: PlatformHealthResponse['kpis'] = {
  tenantCount: 0,
  activeTenantCount: 0,
  gmvAllTime: '0',
  gmv30d: '0',
  mrr: '0',
  publishedListings: 0,
  bookings30d: 0,
  webhookFailures: 0,
  overduePayouts: 0,
};

/** The five platform KPI stat cards. `kpis` may be null (health fetch failed) → zeros. */
export function PlatformKpiCards({
  kpis,
}: {
  kpis: PlatformHealthResponse['kpis'] | null | undefined;
}) {
  const k = kpis ?? EMPTY_KPIS;

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="MRR nền tảng"
        value={formatVnd(k.mrr)}
        hint="Doanh thu đăng ký định kỳ / tháng"
        icon={<TrendingUp className="size-4" />}
        tone="positive"
      />
      <StatCard
        label="GMV toàn thời gian"
        value={formatVnd(k.gmvAllTime)}
        hint={`${formatVnd(k.gmv30d)} trong 30 ngày`}
        icon={<Banknote className="size-4" />}
      />
      <StatCard
        label="Tenant"
        value={formatNumber(k.tenantCount)}
        hint={`${formatNumber(k.activeTenantCount)} đang hoạt động`}
        icon={<Building2 className="size-4" />}
      />
      <StatCard
        label="Listing đã đăng"
        value={formatNumber(k.publishedListings)}
        hint={`${formatNumber(k.bookings30d)} booking trong 30 ngày`}
        icon={<ListChecks className="size-4" />}
      />
      <StatCard
        label="Cảnh báo vận hành"
        value={formatNumber(k.webhookFailures + k.overduePayouts)}
        hint={`${formatNumber(k.webhookFailures)} webhook · ${formatNumber(k.overduePayouts)} payout trễ`}
        icon={<AlertTriangle className="size-4" />}
        tone={k.webhookFailures + k.overduePayouts > 0 ? 'critical' : 'default'}
      />
    </section>
  );
}
