import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarClock,
  ListChecks,
  TrendingUp,
  Webhook,
} from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Empty, EmptyDescription, EmptyTitle } from '@booking/ui/components/ui/empty';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import type { PlatformHealthResponse, PlatformHealthTenant } from '@booking/contracts';
import {
  formatDate,
  formatDaysLeft,
  formatHours,
  formatNumber,
  formatVnd,
  formatVndCompact,
} from '~/lib/format';
import { VERTICAL_LABELS } from '~/constants/tenancy';
import { PageHeader } from '~/components/page-header';
import { StatCard } from '~/components/stat-card';
import { GmvChart } from '~/features/admin/components/gmv-chart';
import { SubscriptionStatusBadge, TenantStatusBadge } from '~/components/status-badge';
import { CountSignal } from '~/features/admin/components/count-signal';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tổng quan nền tảng · Bookify Admin' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requirePlatform(request, 'platform.tenants.read');
  const res = await apiGet<PlatformHealthResponse>('/platform/health', auth);
  return { health: res.ok ? res.data : null, error: res.ok ? null : res.error };
}

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

export default function AdminOverview({ loaderData }: Route.ComponentProps) {
  const { health, error } = loaderData;
  const kpis = health?.kpis ?? EMPTY_KPIS;
  const trend = health?.gmvTrend ?? [];
  const tenants = health?.tenants ?? [];
  const expiring = health?.expiring ?? [];

  const columns: DataTableColumn<PlatformHealthTenant>[] = [
    {
      header: 'Tenant',
      cell: (t) => (
        <Link
          to={`/admin/tenants/${t.tenantId}`}
          className="group inline-flex flex-col gap-0.5"
        >
          <span className="font-medium underline-offset-4 group-hover:underline">{t.name}</span>
          <span className="text-xs text-muted-foreground">
            {t.slug} · {VERTICAL_LABELS[t.vertical] ?? t.vertical}
          </span>
        </Link>
      ),
    },
    { header: 'Trạng thái', cell: (t) => <TenantStatusBadge status={t.status} /> },
    {
      header: 'GMV',
      headClassName: 'text-right',
      className: 'text-right tabular-nums',
      cell: (t) => (
        <span title={formatVnd(t.gmv)} className="font-medium">
          {formatVndCompact(t.gmv)}
        </span>
      ),
    },
    {
      header: 'Listing đăng',
      headClassName: 'text-right',
      className: 'text-right tabular-nums',
      cell: (t) => formatNumber(t.publishedListings),
    },
    {
      header: 'Booking đầu tiên',
      headClassName: 'text-right',
      className: 'text-right tabular-nums',
      cell: (t) => (
        <span className="text-muted-foreground">{formatHours(t.firstBookingHours)}</span>
      ),
    },
    {
      header: 'Webhook lỗi',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (t) => (
        <div className="flex justify-end">
          <CountSignal count={t.webhookFailures} />
        </div>
      ),
    },
    {
      header: 'Payout trễ',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (t) => (
        <div className="flex justify-end">
          <CountSignal count={t.overduePayouts} />
        </div>
      ),
    },
    {
      header: 'Gói',
      cell: (t) =>
        t.subscription ? (
          <div className="flex flex-col gap-1">
            <SubscriptionStatusBadge status={t.subscription.status} />
            <span className="text-xs text-muted-foreground">
              đến {formatDate(t.subscription.expiresAt)}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Chưa gán</span>
        ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Tổng quan nền tảng"
        description="Sức khoẻ toàn nền tảng: GMV, tenant, listing, webhook và payout."
        actions={
          <Button asChild>
            <Link to="/admin/tenants">
              Quản lý tenant
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        }
      />

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Không tải được dữ liệu sức khoẻ nền tảng: {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="MRR nền tảng"
          value={formatVnd(kpis.mrr)}
          hint="Doanh thu đăng ký định kỳ / tháng"
          icon={<TrendingUp className="size-4" />}
          tone="positive"
        />
        <StatCard
          label="GMV toàn thời gian"
          value={formatVnd(kpis.gmvAllTime)}
          hint={`${formatVnd(kpis.gmv30d)} trong 30 ngày`}
          icon={<Banknote className="size-4" />}
        />
        <StatCard
          label="Tenant"
          value={formatNumber(kpis.tenantCount)}
          hint={`${formatNumber(kpis.activeTenantCount)} đang hoạt động`}
          icon={<Building2 className="size-4" />}
        />
        <StatCard
          label="Listing đã đăng"
          value={formatNumber(kpis.publishedListings)}
          hint={`${formatNumber(kpis.bookings30d)} booking trong 30 ngày`}
          icon={<ListChecks className="size-4" />}
        />
        <StatCard
          label="Cảnh báo vận hành"
          value={formatNumber(kpis.webhookFailures + kpis.overduePayouts)}
          hint={`${formatNumber(kpis.webhookFailures)} webhook · ${formatNumber(kpis.overduePayouts)} payout trễ`}
          icon={<AlertTriangle className="size-4" />}
          tone={kpis.webhookFailures + kpis.overduePayouts > 0 ? 'critical' : 'default'}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-muted-foreground" />
              GMV 14 ngày gần nhất
            </CardTitle>
            <CardDescription>Tổng giá trị booking đã xác nhận theo ngày.</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length > 0 ? (
              <GmvChart data={trend} />
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                Chưa có dữ liệu GMV.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-muted-foreground" />
              Sắp hết hạn
            </CardTitle>
            <CardDescription>Gói/dùng thử hết hạn trong 14 ngày tới.</CardDescription>
          </CardHeader>
          <CardContent>
            {expiring.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Không có gói nào sắp hết hạn.
              </p>
            ) : (
              <ul className="divide-y">
                {expiring.map((e) => {
                  const tone =
                    e.daysLeft <= 3
                      ? 'text-rose-600 dark:text-rose-400'
                      : e.daysLeft <= 7
                        ? 'text-warning'
                        : 'text-muted-foreground';
                  return (
                    <li key={e.tenantId} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link
                          to={`/admin/tenants/${e.tenantId}`}
                          className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                        >
                          {e.tenantName}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {e.planName} · {formatDate(e.expiresAt)}
                        </span>
                      </div>
                      <span className={`shrink-0 text-xs font-medium tabular-nums ${tone}`}>
                        {formatDaysLeft(e.daysLeft)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Webhook className="size-4 text-muted-foreground" />
              Bảng sức khoẻ tenant
            </h2>
            <p className="text-sm text-muted-foreground">
              Mỗi tenant: GMV, listing đã đăng, thời gian đến booking đầu, webhook lỗi, payout trễ.
            </p>
          </div>
        </div>
        {tenants.length === 0 && !error ? (
          <Empty className="rounded-xl border">
            <EmptyTitle>Chưa có tenant</EmptyTitle>
            <EmptyDescription>
              Tạo tenant đầu tiên để bắt đầu theo dõi sức khoẻ nền tảng.
            </EmptyDescription>
            <Button asChild className="mt-4">
              <Link to="/admin/tenants/new">Tạo tenant</Link>
            </Button>
          </Empty>
        ) : (
          <DataTable
            columns={columns}
            data={tenants}
            getRowKey={(t) => t.tenantId}
            emptyMessage="Chưa có tenant."
          />
        )}
      </section>
    </div>
  );
}
