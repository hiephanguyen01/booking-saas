import { Link } from 'react-router';
import type {
  BookingResponse,
  ListingResponse,
  SubscriptionStatusResponse,
  TenantFinanceSummaryResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Separator } from '@booking/ui/components/ui/separator';
import { CalendarCheck, ClipboardList, Store, Wallet } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { PENDING_BOOKING_STATUSES } from '~/constants/booking';
import { formatNumber } from '~/lib/format';
import { Money } from '~/components/money';
import { PageHeader } from '~/components/page-header';
import { QuickLink } from '~/components/quick-link';
import { StatCard } from '~/components/stat-card';
import { PayablesCard } from '~/features/tenant/components/overview/payables-card';
import { RecentBookingsCard } from '~/features/tenant/components/overview/recent-bookings-card';
import { SubscriptionStatusCard } from '~/features/tenant/components/overview/subscription-status-card';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tổng quan · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership, can } = await requireTenant(request);

  const [summaryRes, bookingsRes, listingsRes, subRes] = await Promise.all([
    can('tenant.finance.read')
      ? apiGet<TenantFinanceSummaryResponse>('/tenant/finance/summary', auth)
      : Promise.resolve(null),
    can('tenant.bookings.read')
      ? apiGet<{ items: BookingResponse[] }>('/tenant/bookings?page=1&pageSize=100', auth)
      : Promise.resolve(null),
    can('tenant.listings.read')
      ? apiGet<{ items: ListingResponse[]; total: number }>('/tenant/listings?page=1&pageSize=100', auth)
      : Promise.resolve(null),
    can('tenant.settings.manage')
      ? apiGet<SubscriptionStatusResponse>('/tenant/subscription/status', auth)
      : Promise.resolve(null),
  ]);

  const listingsPage = listingsRes?.ok ? listingsRes.data : null;
  const listings = listingsPage?.items ?? (listingsRes?.ok ? [] : null);
  const bookings = bookingsRes?.ok ? (bookingsRes.data?.items ?? []) : null;

  return {
    tenantName: membership.tenantName ?? 'Tenant',
    summary: summaryRes?.ok ? summaryRes.data : null,
    recentBookings: bookings ? bookings.slice(0, 6) : null,
    bookingStats: bookings
      ? {
          total: bookings.length,
          pending: bookings.filter((b) => PENDING_BOOKING_STATUSES.includes(b.status)).length,
          confirmed: bookings.filter((b) => b.status === 'confirmed').length,
          completed: bookings.filter((b) => b.status === 'completed').length,
        }
      : null,
    subscription: subRes?.ok ? subRes.data : null,
    pendingReview: listings ? listings.filter((l) => l.status === 'pending_review').length : null,
    publishedCount: listings ? listings.filter((l) => l.status === 'published').length : null,
    totalListings: listingsPage ? listingsPage.total : null,
    can: {
      finance: can('tenant.finance.read'),
      bookings: can('tenant.bookings.read'),
      listings: can('tenant.listings.read'),
    },
  };
}

export default function TenantOverview({ loaderData }: Route.ComponentProps) {
  const {
    tenantName,
    summary,
    recentBookings,
    bookingStats,
    subscription,
    pendingReview,
    publishedCount,
    totalListings,
    can,
  } = loaderData;

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
            value={<Money value={summary.netRevenue} />}
            hint="Sau chiết khấu & hoàn tiền"
            icon={<Wallet className="size-4" />}
            tone="positive"
          />
          <StatCard label="Phải trả đối tác" value={<Money value={summary.partnerPayable} />} tone="default" />
          <StatCard label="Phải trả cộng tác viên" value={<Money value={summary.affiliatePayable} />} tone="default" />
          <StatCard label="Phí nền tảng" value={<Money value={summary.platformFeePayable} />} tone="muted" />
        </div>
      ) : null}

      {bookingStats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Đơn gần đây"
            value={formatNumber(bookingStats.total)}
            hint="Trên toàn hệ thống"
            icon={<CalendarCheck className="size-4" />}
          />
          <StatCard
            label="Chờ xử lý"
            value={formatNumber(bookingStats.pending)}
            tone={bookingStats.pending > 0 ? 'warning' : 'muted'}
          />
          <StatCard label="Đã xác nhận" value={formatNumber(bookingStats.confirmed)} tone="positive" />
          <StatCard label="Hoàn tất" value={formatNumber(bookingStats.completed)} tone="default" />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <RecentBookingsCard bookings={recentBookings} canView={can.bookings} className="lg:col-span-2" />

        <div className="space-y-6">
          {subscription ? <SubscriptionStatusCard sub={subscription} /> : null}

          {summary ? <PayablesCard summary={summary} /> : null}

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
        {can.listings ? (
          <QuickLink to="/tenant/listings" icon={<Store className="size-5" />} label="Quản lý listing" />
        ) : null}
        {can.bookings ? (
          <QuickLink to="/tenant/bookings" icon={<CalendarCheck className="size-5" />} label="Xem đặt chỗ" />
        ) : null}
        {can.finance ? (
          <QuickLink to="/tenant/finance" icon={<Wallet className="size-5" />} label="Tài chính & chi trả" />
        ) : null}
      </div>
    </div>
  );
}
