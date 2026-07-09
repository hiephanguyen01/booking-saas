import { Link } from 'react-router';
import type {
  BookingResponse,
  ListingResponse,
  TenantFinanceSummaryResponse,
} from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Separator } from '@booking/ui/components/ui/separator';
import {
  ArrowUpRight,
  CalendarCheck,
  ClipboardList,
  Store,
  Wallet,
} from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from './tenant.server';
import { formatVnd, formatDateTime } from './format';
import { BarRow, PageHeader, StatCard } from './components/page';
import { BookingStatusBadge } from './components/status';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tổng quan · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership, can } = await requireTenant(request);

  const [summaryRes, bookingsRes, listingsRes] = await Promise.all([
    can('tenant.finance.read')
      ? apiGet<TenantFinanceSummaryResponse>('/tenant/finance/summary', auth)
      : Promise.resolve(null),
    can('tenant.bookings.read')
      ? apiGet<BookingResponse[]>('/tenant/bookings', auth)
      : Promise.resolve(null),
    can('tenant.listings.read')
      ? apiGet<ListingResponse[]>('/tenant/listings', auth)
      : Promise.resolve(null),
  ]);

  const listings = listingsRes?.ok ? (listingsRes.data ?? []) : null;

  return {
    tenantName: membership.tenantName ?? 'Tenant',
    summary: summaryRes?.ok ? summaryRes.data : null,
    recentBookings: bookingsRes?.ok ? (bookingsRes.data ?? []).slice(0, 6) : null,
    pendingReview: listings ? listings.filter((l) => l.status === 'pending_review').length : null,
    publishedCount: listings ? listings.filter((l) => l.status === 'published').length : null,
    totalListings: listings ? listings.length : null,
    can: {
      finance: can('tenant.finance.read'),
      bookings: can('tenant.bookings.read'),
      listings: can('tenant.listings.read'),
    },
  };
}

export default function TenantOverview({ loaderData }: Route.ComponentProps) {
  const { tenantName, summary, recentBookings, pendingReview, publishedCount, totalListings, can } =
    loaderData;

  const payables = summary
    ? [
        { label: 'Trả đối tác', value: Number(summary.partnerPayable), tone: 'emerald' as const },
        { label: 'Trả affiliate', value: Number(summary.affiliatePayable), tone: 'sky' as const },
        { label: 'Phí nền tảng', value: Number(summary.platformFeePayable), tone: 'amber' as const },
      ]
    : [];
  const payMax = payables.reduce((m, p) => Math.max(m, Math.abs(p.value)), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Xin chào, ${tenantName}`}
        description="Tổng quan hoạt động marketplace của bạn hôm nay."
      />

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Doanh thu ròng"
            value={formatVnd(summary.netRevenue)}
            hint="Sau chiết khấu & hoàn tiền"
            icon={<Wallet className="size-4" />}
            tone="positive"
          />
          <StatCard label="Phải trả đối tác" value={formatVnd(summary.partnerPayable)} tone="default" />
          <StatCard label="Phải trả affiliate" value={formatVnd(summary.affiliatePayable)} tone="default" />
          <StatCard label="Phí nền tảng" value={formatVnd(summary.platformFeePayable)} tone="muted" />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle>Đặt chỗ gần đây</CardTitle>
              <CardDescription>6 đơn mới nhất trên toàn hệ thống</CardDescription>
            </div>
            {can.bookings ? (
              <Button asChild variant="ghost" size="sm">
                <Link to="/tenant/bookings">
                  Tất cả <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {!can.bookings ? (
              <EmptyLine text="Bạn không có quyền xem đặt chỗ." />
            ) : recentBookings && recentBookings.length > 0 ? (
              <ul className="divide-y">
                {recentBookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{b.code}</span>
                        <BookingStatusBadge status={b.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(b.createdAt)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums">{formatVnd(b.finalAmount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyLine text="Chưa có đặt chỗ nào." />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {summary ? (
            <Card>
              <CardHeader>
                <CardTitle>Công nợ phải trả</CardTitle>
                <CardDescription>Số dư đang chờ chi trả</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {payMax === 0 ? (
                  <EmptyLine text="Chưa phát sinh công nợ." />
                ) : (
                  payables.map((p) => (
                    <BarRow
                      key={p.label}
                      label={p.label}
                      value={p.value}
                      max={payMax}
                      display={formatVnd(p.value)}
                      tone={p.tone}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}

          {can.listings ? (
            <Card>
              <CardHeader>
                <CardTitle>Kiểm duyệt</CardTitle>
                <CardDescription>Listing đang chờ xử lý</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-semibold tabular-nums">{pendingReview ?? 0}</span>
                  <span className="text-xs text-muted-foreground">
                    {publishedCount ?? 0} hiển thị · {totalListings ?? 0} tổng
                  </span>
                </div>
                <Separator />
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/tenant/listings">
                    <ClipboardList className="size-4" /> Mở hàng chờ duyệt
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickLink to="/tenant/listings" icon={<Store className="size-5" />} title="Quản lý listing" show={can.listings} />
        <QuickLink to="/tenant/bookings" icon={<CalendarCheck className="size-5" />} title="Xem đặt chỗ" show={can.bookings} />
        <QuickLink to="/tenant/finance" icon={<Wallet className="size-5" />} title="Tài chính & chi trả" show={can.finance} />
      </div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function QuickLink({
  to,
  icon,
  title,
  show,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm font-medium transition-colors hover:bg-accent"
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      {title}
      <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
    </Link>
  );
}
