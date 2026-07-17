import { useMemo } from 'react';
import { Link } from 'react-router';
import { CalendarClock, CalendarDays, CircleAlert, Hourglass, Store, Wallet } from 'lucide-react';
import type {
  BookingStatus,
  ListingResponse,
  PartnerCalendarBookingResponse,
  PartnerFinanceResponse,
  PartnerResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { PageHeader } from '~/components/page-header';
import { StatCard } from '~/components/stat-card';
import { MiniBarChart, type BarDatum } from '~/features/partner/components/mini-bar-chart';
import { BookingStatusBadge } from '~/components/status-badge';
import { formatTime, formatVnd, dayKey, formatDayLabel } from '~/lib/format';
import { addDays, parseDay, startOfDayUtc, todayString, toDayString } from '~/lib/calendar-dates';

const ACTIVE: BookingStatus[] = ['pending_approval', 'pending_payment', 'confirmed'];

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tổng quan · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership, can } = await requirePartner(request);
  const today = todayString();
  const from = startOfDayUtc(today);
  const to = startOfDayUtc(toDayString(addDays(parseDay(today), 30)));

  const [financeRes, feedRes, listingsRes, profileRes] = await Promise.all([
    can('partner.finance.read')
      ? apiGet<PartnerFinanceResponse>('/partner/finance', auth)
      : Promise.resolve(null),
    can('partner.bookings.read')
      ? apiGet<PartnerCalendarBookingResponse[]>(
          `/partner/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          auth,
        )
      : Promise.resolve(null),
    can('partner.listings.read')
      ? apiGet<ListingResponse[]>('/partner/listings', auth)
      : Promise.resolve(null),
    can('partner.profile.manage')
      ? apiGet<PartnerResponse>('/partner/profile', auth)
      : Promise.resolve(null),
  ]);

  const bookings = feedRes && feedRes.ok && feedRes.data ? feedRes.data : [];
  const listings = listingsRes && listingsRes.ok && listingsRes.data ? listingsRes.data : [];
  const profile = profileRes && profileRes.ok && profileRes.data ? profileRes.data : null;

  return {
    partnerName: membership.partnerName,
    balance: financeRes && financeRes.ok && financeRes.data ? financeRes.data.balance : null,
    bookings,
    publishedCount: listings.filter((l) => l.status === 'published').length,
    hasListingsScope: can('partner.listings.read'),
    today,
    profileStatus: profile ? profile.status : null,
    verificationStatus: profile ? profile.verificationStatus : null,
    reviewNote: profile ? profile.identityInfo.reviewNote : null,
  };
}

export default function PartnerOverview({ loaderData }: Route.ComponentProps) {
  const {
    partnerName,
    balance,
    bookings,
    publishedCount,
    hasListingsScope,
    today,
    profileStatus,
    verificationStatus,
    reviewNote,
  } = loaderData;
  const nowIso = new Date().toISOString();

  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => ACTIVE.includes(b.status) && b.endUtc >= nowIso)
        .sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
    [bookings, nowIso],
  );
  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === 'pending_approval').length,
    [bookings],
  );

  // 14-day booking-count series for the trend chart.
  const chart: BarDatum[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bookings)
      counts.set(dayKey(b.startUtc), (counts.get(dayKey(b.startUtc)) ?? 0) + 1);
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

      {verificationStatus === 'rejected' ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Xác minh danh tính bị từ chối</AlertTitle>
          <AlertDescription className="space-y-2">
            <span>{reviewNote ?? 'Vui lòng kiểm tra và gửi lại thông tin định danh.'}</span>
            <Link
              to="/partner/profile"
              prefetch="intent"
              className="inline-flex w-fit rounded-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Cập nhật hồ sơ định danh
            </Link>
          </AlertDescription>
        </Alert>
      ) : profileStatus === 'pending' ? (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Hồ sơ đối tác của bạn đang chờ tenant duyệt. Bạn sẽ đăng được listing sau khi được
            duyệt.
          </span>
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link to="/partner/profile" prefetch="intent">
              Xem hồ sơ
            </Link>
          </Button>
        </div>
      ) : profileStatus === 'approved' && verificationStatus === 'unsubmitted' ? (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Bạn chưa gửi thông tin định danh. Một số loại listing yêu cầu xác minh danh tính.
          </span>
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link to="/partner/profile" prefetch="intent">
              Gửi định danh
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Số dư"
          value={balance !== null ? formatVnd(balance) : '-'}
          hint="Nền tảng còn phải trả bạn"
          icon={<Wallet className="size-4" />}
          tone={balance !== null && balance.startsWith('-') ? 'negative' : 'positive'}
        />
        <StatCard
          label="Sắp tới (30 ngày)"
          value={String(upcoming.length)}
          hint="Lượt đặt đang hoạt động"
          icon={<CalendarClock className="size-4" />}
        />
        <StatCard
          label="Chờ duyệt"
          value={String(pendingCount)}
          hint={pendingCount > 0 ? 'Cần bạn xử lý' : 'Không có yêu cầu mới'}
          icon={<Hourglass className="size-4" />}
          tone={pendingCount > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label={hasListingsScope ? 'Tin đang hiển thị' : 'Mật độ lịch'}
          value={hasListingsScope ? String(publishedCount) : `${bookedDays}/14`}
          hint={hasListingsScope ? 'Đang mở nhận đặt' : 'Số ngày có lịch (14 ngày tới)'}
          icon={<Store className="size-4" />}
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
              <p className="py-6 text-center text-sm text-muted-foreground">
                Chưa có lượt đặt sắp tới.
              </p>
            ) : (
              <ul className="divide-y">
                {upcoming.slice(0, 6).map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
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
