import { useMemo } from 'react';
import { Link } from 'react-router';
import { CalendarClock, CalendarDays, Hourglass, Store, Wallet } from 'lucide-react';
import type {
  BookingStatus,
  ListingResponse,
  PartnerCalendarBookingResponse,
  PartnerFinanceResponse,
} from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requirePartner, canPartner } from './lib.server';
import { PageHeader } from './components/page-header';
import { KpiCard } from './components/kpi-card';
import { MiniBarChart, type BarDatum } from './components/mini-bar-chart';
import { BookingStatusBadge } from './components/booking-status-badge';
import { formatTime, formatVnd, dayKey, formatDayLabel } from './components/format';
import { addDays, parseDay, startOfDayUtc, todayString, toDayString } from './components/calendar-dates';

const ACTIVE: BookingStatus[] = ['pending_approval', 'pending_payment', 'confirmed'];

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tổng quan · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  const today = todayString();
  const from = startOfDayUtc(today);
  const to = startOfDayUtc(toDayString(addDays(parseDay(today), 30)));

  const [financeRes, feedRes, listingsRes] = await Promise.all([
    canPartner(membership, 'partner.finance.read')
      ? apiGet<PartnerFinanceResponse>('/partner/finance', auth)
      : Promise.resolve(null),
    canPartner(membership, 'partner.bookings.read')
      ? apiGet<PartnerCalendarBookingResponse[]>(
          `/partner/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          auth,
        )
      : Promise.resolve(null),
    canPartner(membership, 'partner.listings.read')
      ? apiGet<ListingResponse[]>('/partner/listings', auth)
      : Promise.resolve(null),
  ]);

  const bookings = feedRes && feedRes.ok && feedRes.data ? feedRes.data : [];
  const listings = listingsRes && listingsRes.ok && listingsRes.data ? listingsRes.data : [];

  return {
    partnerName: membership.partnerName,
    balance: financeRes && financeRes.ok && financeRes.data ? financeRes.data.balance : null,
    bookings,
    publishedCount: listings.filter((l) => l.status === 'published').length,
    hasListingsScope: canPartner(membership, 'partner.listings.read'),
    today,
  };
}

export default function PartnerOverview({ loaderData }: Route.ComponentProps) {
  const { partnerName, balance, bookings, publishedCount, hasListingsScope, today } = loaderData;
  const nowIso = new Date().toISOString();

  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => ACTIVE.includes(b.status) && b.endUtc >= nowIso)
        .sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
    [bookings, nowIso],
  );
  const pendingCount = useMemo(() => bookings.filter((b) => b.status === 'pending_approval').length, [bookings]);

  // 14-day booking-count series for the trend chart.
  const chart: BarDatum[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bookings) counts.set(dayKey(b.startUtc), (counts.get(dayKey(b.startUtc)) ?? 0) + 1);
    return Array.from({ length: 14 }, (_, i) => {
      const dayStr = toDayString(addDays(parseDay(today), i));
      const d = parseDay(dayStr);
      return {
        label: String(d.getUTCDate()).padStart(2, '0'),
        value: counts.get(dayStr) ?? 0,
        highlight: dayStr === today,
      };
    });
  }, [bookings, today]);

  const bookedDays = chart.filter((c) => c.value > 0).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title={partnerName ? `Xin chào, ${partnerName}` : 'Tổng quan'}
        description="Tình hình đặt chỗ, doanh thu và tin đăng của bạn."
        actions={
          <Button asChild size="sm">
            <Link to="/partner/calendar" prefetch="intent">
              <CalendarDays className="size-4" aria-hidden /> Xem lịch tổng
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Số dư"
          value={balance !== null ? formatVnd(balance) : '-'}
          hint="Nền tảng còn phải trả bạn"
          icon={Wallet}
          tone={balance !== null && balance.startsWith('-') ? 'negative' : 'positive'}
        />
        <KpiCard
          label="Sắp tới (30 ngày)"
          value={String(upcoming.length)}
          hint="Lượt đặt đang hoạt động"
          icon={CalendarClock}
        />
        <KpiCard
          label="Chờ duyệt"
          value={String(pendingCount)}
          hint={pendingCount > 0 ? 'Cần bạn xử lý' : 'Không có yêu cầu mới'}
          icon={Hourglass}
          tone={pendingCount > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label={hasListingsScope ? 'Tin đang hiển thị' : 'Mật độ lịch'}
          value={hasListingsScope ? String(publishedCount) : `${bookedDays}/14`}
          hint={hasListingsScope ? 'Đang mở nhận đặt' : 'Số ngày có lịch (14 ngày tới)'}
          icon={Store}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Lượt đặt 14 ngày tới</CardTitle>
            <CardDescription>Số lượt đặt bắt đầu mỗi ngày</CardDescription>
          </CardHeader>
          <CardContent>
            <MiniBarChart data={chart} unit="lượt" />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sắp diễn ra</CardTitle>
            <CardDescription>Các lượt đặt gần nhất</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Chưa có lượt đặt sắp tới.</p>
            ) : (
              <ul className="divide-y">
                {upcoming.slice(0, 6).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{b.listingTitle}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatDayLabel(parseDay(dayKey(b.startUtc)))} · {formatTime(b.startUtc)}
                      </p>
                    </div>
                    <BookingStatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
