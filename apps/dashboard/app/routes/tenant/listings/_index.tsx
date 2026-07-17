import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { ListingResponse, Paginated, PartnerResponse, PublishStatus } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Badge } from '@booking/ui/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { ClipboardCheck, Eye } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { BOOKING_MODE_LABEL, formatDateTime } from '~/lib/format';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { ListingStatusBadge } from '~/components/status-badge';
import { listingPriceFrom } from '~/lib/listing-price';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Listing · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.listings.read');
  // `GET /tenant/listings` is paginated; pull a full moderation page (max 100).
  const [res, partnersRes] = await Promise.all([
    apiGet<Paginated<ListingResponse>>('/tenant/listings?pageSize=100', auth),
    can('tenant.partners.read')
      ? apiGet<Paginated<PartnerResponse>>('/tenant/partners?pageSize=100', auth)
      : Promise.resolve(null),
  ]);
  const partnerNames: Record<string, string> = {};
  if (partnersRes?.ok) for (const p of partnersRes.data?.items ?? []) partnerNames[p.id] = p.name;
  return {
    listings: res.ok ? (res.data?.items ?? []) : [],
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
              {BOOKING_MODE_LABEL[m] ?? m}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      header: 'Giá từ',
      cell: (l) => {
        const price = listingPriceFrom(l);
        return price ? (
          <Money value={price} className="text-sm" />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        );
      },
      className: 'hidden sm:table-cell whitespace-nowrap',
      headClassName: 'hidden sm:table-cell',
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
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
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
