import { Link, useSearchParams } from 'react-router';
import { dehydrate, HydrationBoundary, useQuery } from '@tanstack/react-query';
import { makeQueryClient } from '@booking/query';
import type { BookingMode, BookingResponse, PartnerResponse, Paginated } from '@booking/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@booking/ui/components/ui/select';
import { TriangleAlert } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { BOOKING_MODE_LABEL, formatDateTime, formatRate } from '~/lib/format';
import { PageHeader } from '~/components/page-header';
import { StatCard } from '~/components/stat-card';
import { BookingStatusBadge } from '~/components/status-badge';
import { Money } from '~/components/money';
import {
  bookingListQueryOptions,
  parseBookingStatus,
  type BookingStatusFilter,
} from '~/features/bookings/booking-list.query';
import { fetchBookingList } from '~/features/bookings/booking-list.server';
import { dashboardPaths } from '~/lib/paths';

interface PartnerStat {
  partnerId: string;
  total: number;
  cancelled: number;
  noShow: number;
  completed: number;
  confirmed: number;
  cancellationRate: number;
  noShowRate: number;
}

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đặt chỗ · Tenant · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can, tenantId } = await requireTenant(request, 'tenant.bookings.read');
  const status = parseBookingStatus(url.searchParams.get('status'));
  const queryClient = makeQueryClient();
  const [, statsRes, partnersRes] = await Promise.all([
    queryClient.fetchQuery({
      ...bookingListQueryOptions(tenantId, status),
      queryFn: ({ signal }) =>
        fetchBookingList(auth, status, AbortSignal.any([request.signal, signal])),
    }),
    apiGet<PartnerStat[]>('/tenant/bookings/partner-stats', auth, { signal: request.signal }),
    can('tenant.partners.read')
      ? apiGet<Paginated<PartnerResponse>>('/tenant/partners?pageSize=100', auth, {
          signal: request.signal,
        })
      : Promise.resolve(null),
  ]);

  const partners = partnersRes?.ok ? (partnersRes.data?.items ?? []) : [];
  const partnerNames: Record<string, string> = {};
  for (const p of partners) partnerNames[p.id] = p.name;

  return {
    tenantId,
    status,
    dehydratedState: dehydrate(queryClient),
    stats: statsRes.ok ? (statsRes.data ?? []) : [],
    partnerNames,
  };
}

export default function TenantBookings({ loaderData }: Route.ComponentProps) {
  return (
    <HydrationBoundary state={loaderData.dehydratedState}>
      <TenantBookingsPage
        tenantId={loaderData.tenantId}
        status={loaderData.status}
        stats={loaderData.stats}
        partnerNames={loaderData.partnerNames}
      />
    </HydrationBoundary>
  );
}

interface TenantBookingsPageProps {
  tenantId: string;
  status: BookingStatusFilter;
  stats: PartnerStat[];
  partnerNames: Record<string, string>;
}

function TenantBookingsPage({ tenantId, status, stats, partnerNames }: TenantBookingsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useQuery(bookingListQueryOptions(tenantId, status));
  const bookings = query.data?.items ?? [];
  const kpis = query.data?.summary ?? {
    total: 0,
    active: 0,
    completed: 0,
    revenue: '0',
    capped: false,
  };
  // When the row cap is hit the KPIs cover only the latest slice — say so rather
  // than presenting a truncated count as a cumulative total.
  const cappedHint = kpis.capped ? 'trong 200 đơn gần nhất' : undefined;

  function setStatus(nextStatus: string) {
    const next = new URLSearchParams(searchParams);
    const parsed = parseBookingStatus(nextStatus);
    if (parsed === 'all') next.delete('status');
    else next.set('status', parsed);
    setSearchParams(next, { preventScrollReset: true });
  }

  const bookingColumns: DataTableColumn<BookingResponse>[] = [
    {
      header: 'Mã',
      cell: (b) => (
        <Link to={dashboardPaths.tenant.booking(b.id)} className="font-mono text-sm font-medium text-primary hover:underline">
          {b.code}
        </Link>
      ),
    },
    {
      header: 'Khách hàng',
      cell: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{b.customer.fullName}</p>
          {b.customer.phone ? (
            <p className="text-xs tabular-nums text-muted-foreground">{b.customer.phone}</p>
          ) : null}
        </div>
      ),
    },
    { header: 'Đối tác', cell: (b) => <span className="text-sm">{partnerNames[b.partnerId] ?? '—'}</span>, className: 'hidden md:table-cell', headClassName: 'hidden md:table-cell' },
    { header: 'Hình thức', cell: (b) => <span className="text-sm text-muted-foreground">{BOOKING_MODE_LABEL[b.bookingMode as BookingMode] ?? b.bookingMode}</span>, className: 'hidden sm:table-cell', headClassName: 'hidden sm:table-cell' },
    { header: 'Bắt đầu', cell: (b) => <span className="text-sm text-muted-foreground">{formatDateTime(b.startUtc)}</span>, className: 'hidden lg:table-cell', headClassName: 'hidden lg:table-cell' },
    { header: 'Trạng thái', cell: (b) => <BookingStatusBadge status={b.status} /> },
    {
      header: 'Giá trị',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (b) => <Money className="font-medium" value={b.finalAmount} />,
    },
  ];

  const statColumns: DataTableColumn<PartnerStat>[] = [
    { header: 'Đối tác', cell: (s) => <span className="font-medium">{partnerNames[s.partnerId] ?? s.partnerId.slice(0, 8)}</span> },
    { header: 'Tổng đơn', cell: (s) => <span className="tabular-nums">{s.total}</span>, className: 'tabular-nums' },
    { header: 'Hoàn tất', cell: (s) => <span className="tabular-nums text-muted-foreground">{s.completed}</span>, className: 'hidden sm:table-cell', headClassName: 'hidden sm:table-cell' },
    { header: 'Tỷ lệ huỷ', cell: (s) => <RateCell value={s.cancellationRate} count={s.cancelled} /> },
    { header: 'Tỷ lệ vắng', cell: (s) => <RateCell value={s.noShowRate} count={s.noShow} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Đặt chỗ" description="Theo dõi đơn đặt và sức khoẻ vận hành của từng đối tác." />

      {query.error ? (
        <Card><CardContent className="p-4 text-sm text-destructive">Không thể cập nhật danh sách đặt chỗ.</CardContent></Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng đơn" value={kpis.total} hint={cappedHint} />
        <StatCard label="Đang hoạt động" value={kpis.active} tone="default" hint={cappedHint} />
        <StatCard label="Đã hoàn tất" value={kpis.completed} tone="positive" hint={cappedHint} />
        <StatCard
          label="Doanh thu ghi nhận"
          value={<Money value={kpis.revenue} />}
          tone="positive"
          hint={cappedHint}
        />
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Danh sách đơn</TabsTrigger>
          <TabsTrigger value="partners">Sức khoẻ đối tác</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className="flex items-center justify-end">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="pending_approval">Chờ duyệt</SelectItem>
                <SelectItem value="pending_payment">Chờ thanh toán</SelectItem>
                <SelectItem value="confirmed">Đã xác nhận</SelectItem>
                <SelectItem value="completed">Hoàn tất</SelectItem>
                <SelectItem value="cancelled">Đã huỷ</SelectItem>
                <SelectItem value="no_show">Không đến</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DataTable columns={bookingColumns} data={bookings} getRowKey={(b) => b.id} emptyMessage="Không có đơn nào." />
        </TabsContent>

        <TabsContent value="partners" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-warning" /> Tỷ lệ huỷ & vắng mặt
              </CardTitle>
              <CardDescription>
                Tỷ lệ cao (≥ 20%) được tô đỏ — cân nhắc rà soát hoặc tạm ngưng đối tác.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable columns={statColumns} data={stats} getRowKey={(s) => s.partnerId} emptyMessage="Chưa có dữ liệu đối tác." />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RateCell({ value, count }: { value: number; count: number }) {
  const high = value >= 0.2;
  return (
    <span className={high ? 'font-medium tabular-nums text-destructive' : 'tabular-nums text-muted-foreground'}>
      {formatRate(value)} <span className="text-xs">({count})</span>
    </span>
  );
}

