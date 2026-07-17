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
import {
  ArrowUpRight,
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  ClipboardList,
  Store,
  Wallet,
} from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { PENDING_BOOKING_STATUSES } from '~/constants/booking';
import { SUB_PHASE_LABEL } from '~/constants/tenancy';
import { formatVnd, formatDateTime, formatNumber, formatDaysLeft } from '~/lib/format';
import { Money } from '~/components/money';
import { PageHeader } from '~/components/page-header';
import { BarRow, StatCard } from '~/components/stat-card';
import { BookingStatusBadge } from '~/components/status-badge';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tổng quan · Tenant · Bookify' }];
}

/** Booking counts derived from the tenant's recent-bookings feed, for the KPI strip. */

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership, can } = await requireTenant(request);

  const [summaryRes, bookingsRes, listingsRes, subRes] = await Promise.all([
    can('tenant.finance.read')
      ? apiGet<TenantFinanceSummaryResponse>('/tenant/finance/summary', auth)
      : Promise.resolve(null),
    can('tenant.bookings.read')
      ? apiGet<BookingResponse[]>('/tenant/bookings', auth)
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
  const bookings = bookingsRes?.ok ? (bookingsRes.data ?? []) : null;

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

  const payables = summary
    ? [
        { label: 'Trả đối tác', value: Number(summary.partnerPayable), tone: 'emerald' as const },
        { label: 'Trả affiliate', value: Number(summary.affiliatePayable), tone: 'sky' as const },
        { label: 'Phí nền tảng', value: Number(summary.platformFeePayable), tone: 'warning' as const },
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
            value={<Money value={summary.netRevenue} />}
            hint="Sau chiết khấu & hoàn tiền"
            icon={<Wallet className="size-4" />}
            tone="positive"
          />
          <StatCard label="Phải trả đối tác" value={<Money value={summary.partnerPayable} />} tone="default" />
          <StatCard label="Phải trả affiliate" value={<Money value={summary.affiliatePayable} />} tone="default" />
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
          {subscription ? <SubscriptionCard sub={subscription} /> : null}

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

/** Subscription phase + soft booking-quota snapshot (§6.5). The escalation banners live in the layout. */
function SubscriptionCard({ sub }: { sub: SubscriptionStatusResponse }) {
  const { phase, daysUntilExpiry, bookingQuota } = sub;
  const phaseTone = phase === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-warning';
  const quotaPct =
    bookingQuota && bookingQuota.limit > 0
      ? Math.min(100, Math.round((bookingQuota.used / bookingQuota.limit) * 100))
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {phase === 'active' ? (
            <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <CalendarClock className="size-4 text-warning" />
          )}
          Gói dịch vụ
        </CardTitle>
        <CardDescription>Trạng thái đăng ký & hạn mức tháng này</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Tình trạng</span>
          <span className={`font-medium ${phaseTone}`}>{SUB_PHASE_LABEL[phase]}</span>
        </div>
        {phase === 'active' && daysUntilExpiry >= 0 ? (
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Hạn gia hạn</span>
            <span className="font-medium tabular-nums">{formatDaysLeft(daysUntilExpiry)}</span>
          </div>
        ) : null}
        {bookingQuota ? (
          <BarRow
            label="Hạn mức đặt chỗ"
            value={bookingQuota.used}
            max={Math.max(bookingQuota.limit, bookingQuota.used, 1)}
            display={`${formatNumber(bookingQuota.used)} / ${formatNumber(bookingQuota.limit)}`}
            tone={bookingQuota.overLimit ? 'rose' : 'primary'}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Chưa có gói dịch vụ đang hoạt động.</p>
        )}
        {quotaPct !== null && !bookingQuota?.overLimit && quotaPct >= 80 ? (
          <p className="text-xs text-warning">Đã dùng {quotaPct}% hạn mức — cân nhắc nâng cấp gói.</p>
        ) : null}
      </CardContent>
    </Card>
  );
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
