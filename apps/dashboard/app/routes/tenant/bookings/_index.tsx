import { Link, useSearchParams } from 'react-router';
import type { BookingMode, BookingResponse, PartnerResponse, Paginated } from '@booking/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@booking/ui/components/ui/select';
import { TriangleAlert } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { formatDateTime, formatRate } from '~/lib/format';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { PageHeader } from '~/components/page-header';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { StatCard } from '~/components/stat-card';
import { BookingStatusBadge } from '~/components/status-badge';
import { Money } from '~/components/money';
import { parseBookingStatus, type BookingStatusFilter } from '~/features/bookings/lib/booking-list';
import { BOOKINGS_FILTER_SPEC } from '~/features/bookings/lib/booking-filters';
import { fetchBookingList } from '~/features/bookings/server/booking-list.server';
import { dashboardPaths } from '~/constants/paths';
import { readListParams } from '~/lib/pagination';
import { readListFilters, hasActiveFilters } from '~/lib/list-filters';
import { apiPaths, FETCH_ALL_PAGE_SIZE } from '~/constants/api-paths';

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
  return [{ title: 'Đặt chỗ · Tenant · BookingOS' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.bookings.read');
  const status = parseBookingStatus(url.searchParams.get('status'));
  const { page, pageSize } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, BOOKINGS_FILTER_SPEC);
  const [list, statsRes, partnersRes] = await Promise.all([
    fetchBookingList(auth, status, page, pageSize, request.signal, apiFilters),
    apiGet<PartnerStat[]>(apiPaths.tenant.bookingPartnerStats, auth, { signal: request.signal }),
    can('tenant.partners.read')
      ? apiGet<Paginated<PartnerResponse>>(apiPaths.tenant.partners, auth, {
          query: { pageSize: FETCH_ALL_PAGE_SIZE },
          signal: request.signal,
        })
      : Promise.resolve(null),
  ]);

  const partners = partnersRes?.ok ? (partnersRes.data?.items ?? []) : [];
  const partnerNames: Record<string, string> = {};
  for (const p of partners) partnerNames[p.id] = p.name;

  return {
    status,
    bookings: list.items,
    total: list.total,
    stats: statsRes.ok ? (statsRes.data ?? []) : [],
    partnerNames,
    // Merge the status into the filter map so "Xoá lọc" clears it too.
    filters: { ...filters, status: status === 'all' ? '' : status },
  };
}

export default function TenantBookings({ loaderData }: Route.ComponentProps) {
  return (
    <TenantBookingsPage
      status={loaderData.status}
      bookings={loaderData.bookings}
      total={loaderData.total}
      stats={loaderData.stats}
      partnerNames={loaderData.partnerNames}
      filters={loaderData.filters}
    />
  );
}

interface TenantBookingsPageProps {
  status: BookingStatusFilter;
  bookings: BookingResponse[];
  total: number;
  stats: PartnerStat[];
  partnerNames: Record<string, string>;
  filters: Record<string, string>;
}

function TenantBookingsPage({ status, bookings, total, stats, partnerNames, filters }: TenantBookingsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  // Tenant-wide KPIs come from the partner-stats aggregate (accurate across the
  // whole dataset), never from the current page — summing per-partner counts.
  const kpis = stats.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      confirmed: acc.confirmed + s.confirmed,
      completed: acc.completed + s.completed,
      cancelled: acc.cancelled + s.cancelled,
    }),
    { total: 0, confirmed: 0, completed: 0, cancelled: 0 },
  );

  function setStatus(nextStatus: string) {
    const next = new URLSearchParams(searchParams);
    const parsed = parseBookingStatus(nextStatus);
    if (parsed === 'all') next.delete('status');
    else next.set('status', parsed);
    next.delete('page'); // a filter change resets to page 1
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
    { header: 'Bắt đầu', cell: (b) => <span className="text-sm text-muted-foreground">{formatDateTime(b.startUtc, b.resourceTimezone)}</span>, className: 'hidden lg:table-cell', headClassName: 'hidden lg:table-cell' },
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng đơn" value={kpis.total} />
        <StatCard label="Đã xác nhận" value={kpis.confirmed} tone="default" />
        <StatCard label="Đã hoàn tất" value={kpis.completed} tone="positive" />
        <StatCard label="Đã huỷ" value={kpis.cancelled} tone="negative" />
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Danh sách đơn</TabsTrigger>
          <TabsTrigger value="partners">Sức khoẻ đối tác</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <DashboardDataTable
            columns={bookingColumns}
            data={bookings}
            getRowKey={(booking) => booking.id}
            filters={BOOKINGS_FILTER_SPEC}
            filterValues={filters}
            resetHref={dashboardPaths.tenant.bookings}
            pageSize={pageSize}
            actions={
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="pending_approval">Chờ duyệt</SelectItem>
                  <SelectItem value="pending_payment">Chờ thanh toán</SelectItem>
                  <SelectItem value="confirmed">Đã xác nhận</SelectItem>
                  <SelectItem value="completed">Hoàn tất</SelectItem>
                  <SelectItem value="cancelled">Đã huỷ</SelectItem>
                  <SelectItem value="no_show">Vắng mặt</SelectItem>
                </SelectContent>
              </Select>
            }
            emptyMessage={hasActiveFilters(filters) ? 'Không có đơn nào khớp bộ lọc.' : 'Không có đơn nào.'}
            pagination={{ page, pageSize, total, hrefFor: pageHref }}
          />
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
