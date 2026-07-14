import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { BookingResponse, PartnerResponse, Paginated } from '@booking/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@booking/ui/components/ui/select';
import { TriangleAlert } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatVnd, formatDateTime, formatRate } from '../format';
import { PageHeader, StatCard } from '../components/page';
import { BookingStatusBadge } from '../components/status';

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

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.bookings.read');
  const [bookingsRes, statsRes, partnersRes] = await Promise.all([
    apiGet<BookingResponse[]>('/tenant/bookings', auth),
    apiGet<PartnerStat[]>('/tenant/bookings/partner-stats', auth),
    can('tenant.partners.read')
      ? apiGet<Paginated<PartnerResponse>>('/tenant/partners?pageSize=100', auth)
      : Promise.resolve(null),
  ]);

  const partners = partnersRes?.ok ? (partnersRes.data?.items ?? []) : [];
  const partnerNames: Record<string, string> = {};
  for (const p of partners) partnerNames[p.id] = p.name;

  return {
    bookings: bookingsRes.ok ? (bookingsRes.data ?? []) : [],
    stats: statsRes.ok ? (statsRes.data ?? []) : [],
    partnerNames,
    error: bookingsRes.ok ? null : (bookingsRes.error ?? 'Không tải được đặt chỗ.'),
  };
}

export default function TenantBookings({ loaderData }: Route.ComponentProps) {
  const { bookings, stats, partnerNames, error } = loaderData;
  const [status, setStatus] = useState<string>('all');

  const filtered = useMemo(
    () => (status === 'all' ? bookings : bookings.filter((b) => b.status === status)),
    [status, bookings],
  );

  const kpis = useMemo(() => {
    const active = bookings.filter((b) => b.status === 'confirmed' || b.status === 'pending_approval').length;
    const completed = bookings.filter((b) => b.status === 'completed').length;
    const revenue = bookings
      .filter((b) => b.status === 'confirmed' || b.status === 'completed')
      .reduce((sum, b) => sum + BigInt(b.finalAmount || '0'), 0n);
    return { total: bookings.length, active, completed, revenue: revenue.toString() };
  }, [bookings]);

  const bookingColumns: DataTableColumn<BookingResponse>[] = [
    {
      header: 'Mã',
      cell: (b) => (
        <Link to={`/tenant/bookings/${b.id}`} className="font-mono text-sm font-medium text-primary hover:underline">
          {b.code}
        </Link>
      ),
    },
    { header: 'Đối tác', cell: (b) => <span className="text-sm">{partnerNames[b.partnerId] ?? '—'}</span>, className: 'hidden md:table-cell', headClassName: 'hidden md:table-cell' },
    { header: 'Hình thức', cell: (b) => <span className="text-sm text-muted-foreground">{MODE_LABEL[b.bookingMode] ?? b.bookingMode}</span> },
    { header: 'Bắt đầu', cell: (b) => <span className="text-sm text-muted-foreground">{formatDateTime(b.startUtc)}</span>, className: 'hidden lg:table-cell', headClassName: 'hidden lg:table-cell' },
    { header: 'Trạng thái', cell: (b) => <BookingStatusBadge status={b.status} /> },
    {
      header: 'Giá trị',
      headClassName: 'text-right',
      className: 'text-right font-medium tabular-nums',
      cell: (b) => formatVnd(b.finalAmount),
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

      {error ? (
        <Card><CardContent className="p-4 text-sm text-rose-600 dark:text-rose-400">{error}</CardContent></Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng đơn" value={kpis.total} />
        <StatCard label="Đang hoạt động" value={kpis.active} tone="default" />
        <StatCard label="Đã hoàn tất" value={kpis.completed} tone="positive" />
        <StatCard label="Doanh thu ghi nhận" value={formatVnd(kpis.revenue)} tone="positive" />
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
          <DataTable columns={bookingColumns} data={filtered} getRowKey={(b) => b.id} emptyMessage="Không có đơn nào." />
        </TabsContent>

        <TabsContent value="partners" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-amber-500" /> Tỷ lệ huỷ & vắng mặt
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
    <span className={high ? 'font-medium tabular-nums text-rose-600 dark:text-rose-400' : 'tabular-nums text-muted-foreground'}>
      {formatRate(value)} <span className="text-xs">({count})</span>
    </span>
  );
}

const MODE_LABEL: Record<string, string> = {
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  inventory: 'Cho thuê',
};
