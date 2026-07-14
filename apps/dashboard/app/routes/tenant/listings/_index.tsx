import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { ListingResponse, Paginated, PartnerResponse, PublishStatus } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Badge } from '@booking/ui/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { ClipboardCheck, Eye } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatDateTime } from '../format';
import { PageHeader } from '../components/page';
import { ListingStatusBadge } from '../components/status';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Listing · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.listings.read');
  const [res, partnersRes] = await Promise.all([
    apiGet<ListingResponse[]>('/tenant/listings', auth),
    can('tenant.partners.read')
      ? apiGet<Paginated<PartnerResponse>>('/tenant/partners?pageSize=100', auth)
      : Promise.resolve(null),
  ]);
  const partnerNames: Record<string, string> = {};
  if (partnersRes?.ok) for (const p of partnersRes.data?.items ?? []) partnerNames[p.id] = p.name;
  return {
    listings: res.ok ? (res.data ?? []) : [],
    partnerNames,
    error: res.ok ? null : (res.error ?? 'Không tải được danh sách listing.'),
    canModerate: can('tenant.listings.publish'),
  };
}

type Filter = 'all' | PublishStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending_review', label: 'Chờ duyệt' },
  { value: 'published', label: 'Đang hiển thị' },
  { value: 'draft', label: 'Nháp' },
  { value: 'archived', label: 'Đã ẩn' },
];

export default function TenantListings({ loaderData }: Route.ComponentProps) {
  const { listings, partnerNames, error, canModerate } = loaderData;
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: listings.length };
    for (const l of listings) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [listings]);

  const rows = useMemo(
    () => (filter === 'all' ? listings : listings.filter((l) => l.status === filter)),
    [filter, listings],
  );

  const columns: DataTableColumn<ListingResponse>[] = [
    {
      header: 'Listing',
      cell: (l) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{l.title}</div>
          <div className="truncate text-xs text-muted-foreground">/{l.slug}</div>
        </div>
      ),
    },
    {
      header: 'Đối tác',
      cell: (l) => (
        <span className="text-sm text-muted-foreground">
          {partnerNames[l.partnerId] ?? l.partnerId.slice(0, 8)}
        </span>
      ),
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: 'Hình thức',
      cell: (l) => (
        <div className="flex flex-wrap gap-1">
          {l.bookingModes.map((m) => (
            <Badge key={m} variant="outline" className="font-normal">
              {MODE_LABEL[m] ?? m}
            </Badge>
          ))}
        </div>
      ),
    },
    { header: 'Trạng thái', cell: (l) => <ListingStatusBadge status={l.status} /> },
    {
      header: 'Cập nhật',
      cell: (l) => <span className="text-sm text-muted-foreground">{formatDateTime(l.updatedAt)}</span>,
      className: 'hidden md:table-cell',
      headClassName: 'hidden md:table-cell',
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (l) =>
        canModerate ? (
          <Button asChild variant={l.status === 'pending_review' ? 'default' : 'ghost'} size="sm">
            <Link to={`/tenant/listings/${l.id}/review`}>
              {l.status === 'pending_review' ? (
                <>
                  <ClipboardCheck className="size-4" /> Duyệt
                </>
              ) : (
                <>
                  <Eye className="size-4" /> Xem
                </>
              )}
            </Link>
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Listing"
        description="Quản lý và kiểm duyệt các listing của đối tác trong marketplace."
      />

      {error ? (
        <Card>
          <CardContent className="p-4 text-sm text-rose-600 dark:text-rose-400">{error}</CardContent>
        </Card>
      ) : null}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="flex-wrap">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value} className="gap-2">
              {f.label}
              <span className="rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                {counts[f.value] ?? 0}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(l) => l.id}
        emptyMessage="Không có listing nào trong nhóm này."
      />
    </div>
  );
}

const MODE_LABEL: Record<string, string> = {
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  inventory: 'Cho thuê',
};
