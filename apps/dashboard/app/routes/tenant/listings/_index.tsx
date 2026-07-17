import { Link, useSearchParams } from 'react-router';
import type {
  ListingResponse,
  Paginated,
  PaginatedWithCounts,
  PartnerResponse,
  PublishStatus,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Badge } from '@booking/ui/components/ui/badge';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { ClipboardCheck, Eye } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { formatDateTime } from '~/lib/format';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { ListingStatusBadge } from '~/components/status-badge';
import { StatusFilterTabs } from '~/components/status-filter-tabs';
import { listingPriceFrom } from '~/lib/listing-price';
import { readListParams } from '~/lib/pagination';
import { PaginationBar } from '~/components/pagination-bar';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Listing · Tenant · Bookify' }];
}

const STATUS_VALUES: PublishStatus[] = ['draft', 'pending_review', 'published', 'archived'];

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.listings.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const statusRaw = url.searchParams.get('status') ?? '';
  const status = STATUS_VALUES.includes(statusRaw as PublishStatus) ? statusRaw : '';
  const [res, partnersRes] = await Promise.all([
    apiGet<PaginatedWithCounts<ListingResponse>>('/tenant/listings', auth, {
      query: toApiQuery({ status }),
    }),
    can('tenant.partners.read')
      ? apiGet<Paginated<PartnerResponse>>('/tenant/partners', auth, { query: { pageSize: 100 } })
      : Promise.resolve(null),
  ]);
  const partnerNames: Record<string, string> = {};
  if (partnersRes?.ok) for (const p of partnersRes.data?.items ?? []) partnerNames[p.id] = p.name;
  return {
    result: res.ok ? res.data : null,
    partnerNames,
    error: res.ok ? null : (res.error ?? 'Không tải được danh sách listing.'),
    filters: { status },
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
  const { result, partnerNames, error, canModerate, filters } = loaderData;
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref, filterHref } = readListParams(searchParams);
  const listings = result?.items ?? [];
  const total = result?.total ?? 0;
  const counts = result?.counts;
  const statusValue = filters.status || 'all';

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

      <ErrorBanner error={error} />

      <StatusFilterTabs
        filters={FILTERS}
        value={statusValue}
        hrefFor={(v) => filterHref({ status: v === 'all' ? undefined : v })}
        counts={counts}
      />

      <DataTable
        columns={columns}
        data={listings}
        getRowKey={(l) => l.id}
        emptyMessage="Không có listing nào trong nhóm này."
      />

      <PaginationBar page={page} pageSize={pageSize} total={total} hrefFor={pageHref} />
    </div>
  );
}
