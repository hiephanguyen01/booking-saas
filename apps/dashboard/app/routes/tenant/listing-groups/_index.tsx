import { data as routeData, Link, useFetcher, useSearchParams } from 'react-router';
import { Check, Eye, EyeOff, Undo2 } from 'lucide-react';
import type {
  ListingGroupResponse,
  ListingTypeResponse,
  Paginated,
  PartnerResponse,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { moderationErrorMessage } from '~/features/tenant/server/moderation-action.server';
import { formatDate } from '~/lib/format';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { ListingStatusBadge } from '~/components/status-badge';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { readListParams } from '~/lib/pagination';
import { readListFilters, hasActiveFilters, type FilterSpec } from '~/lib/list-filters';
import { dashboardPaths } from '~/constants/paths';

const LISTING_GROUP_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Tên nhóm…' },
];

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tin đăng nhiều hạng mục · Tenant · BookingOS' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.listings.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, LISTING_GROUP_FILTER_SPEC);
  // NOTE: `/tenant/listing-groups` has no `status` query param (see
  // packages/contracts/src/contracts/listing.ts: listListingGroupsQuerySchema) — this is a
  // bước-đệm (stepping-stone) task that must not touch the backend, so there are no status
  // tabs here (unlike tenant/listings, whose query does support `status` + counts).
  const [res, partnersRes, typesRes] = await Promise.all([
    apiGet<Paginated<ListingGroupResponse>>('/tenant/listing-groups', auth, {
      query: toApiQuery(apiFilters),
    }),
    can('tenant.partners.read')
      ? apiGet<Paginated<PartnerResponse>>('/tenant/partners', auth, { query: { pageSize: 100 } })
      : Promise.resolve(null),
    apiGet<ListingTypeResponse[]>('/tenant/listing-types', auth),
  ]);
  const partnerNames: Record<string, string> = {};
  if (partnersRes?.ok) for (const p of partnersRes.data?.items ?? []) partnerNames[p.id] = p.name;
  const typeNames: Record<string, string> = {};
  if (typesRes.ok) for (const t of typesRes.data ?? []) typeNames[t.id] = t.name;
  return {
    result: res.ok ? res.data : null,
    partnerNames,
    typeNames,
    canModerate: can('tenant.listings.publish'),
    filters,
    error: res.ok ? null : (res.error ?? 'Không tải được tin đăng.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.publish');
  const form = await request.formData();
  const id = String(form.get('id'));
  const intent = String(form.get('intent'));
  if (!['publish', 'hide', 'republish'].includes(intent)) {
    return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  }
  const res = await apiPost(`/tenant/listing-groups/${id}/${intent}`, {}, auth);
  if (!res.ok) {
    const error = moderationErrorMessage(
      res,
      'Có thông tin liên hệ. Chọn “Xem” để kiểm tra và duyệt bất chấp cảnh báo.',
    );
    return routeData({ error, code: res.code }, { status: 400 });
  }
  return { ok: true };
}

export default function TenantListingGroups({ loaderData, actionData }: Route.ComponentProps) {
  const { result, partnerNames, typeNames, canModerate, error, filters } = loaderData;
  const actionError = actionData && 'error' in actionData ? actionData.error : null;
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  const groups = result?.items ?? [];
  const total = result?.total ?? 0;

  const columns: DataTableColumn<ListingGroupResponse>[] = [
    {
      header: 'Tin đăng',
      cell: (g) => (
        <div className="min-w-0">
          <Link
            to={`/tenant/listing-groups/${g.id}/review`}
            className="truncate font-medium hover:underline"
          >
            {g.title}
          </Link>
          <p className="truncate font-mono text-xs text-muted-foreground">{g.slug}</p>
        </div>
      ),
    },
    {
      header: 'Đối tác',
      cell: (g) => (
        <span className="text-sm text-muted-foreground">
          {partnerNames[g.partnerId] ?? '—'}
        </span>
      ),
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: 'Loại',
      cell: (g) => (
        <span className="text-sm text-muted-foreground">{typeNames[g.listingTypeId] ?? '—'}</span>
      ),
      className: 'hidden md:table-cell',
      headClassName: 'hidden md:table-cell',
    },
    {
      header: 'Số hạng mục',
      cell: (g) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {g.listingCount} hạng mục
        </span>
      ),
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: 'Địa chỉ',
      cell: (g) => <span className="text-sm text-muted-foreground">{g.address ?? '—'}</span>,
      className: 'hidden md:table-cell',
      headClassName: 'hidden md:table-cell',
    },
    {
      header: 'Giá từ',
      cell: (g) =>
        g.priceFrom ? (
          <Money value={g.priceFrom} className="text-sm" />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
      className: 'hidden sm:table-cell whitespace-nowrap',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: 'Cập nhật',
      cell: (g) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(g.updatedAt)}
        </span>
      ),
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
    {
      header: 'Trạng thái',
      cell: (g) => (
        <div className="flex items-center gap-1.5">
          <ListingStatusBadge status={g.status} />
          {g.hiddenBy === 'admin' ? (
            <Badge variant="outline" className="border-warning/40 text-warning">
              Admin ẩn
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (g) => (canModerate ? <RowActions group={g} /> : null),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tin đăng nhiều hạng mục"
        description="Duyệt, ẩn hoặc mở lại các tin đăng nhiều hạng mục của đối tác."
      />
      <ErrorBanner error={error ?? actionError} />
      <DashboardDataTable
        columns={columns}
        data={groups}
        getRowKey={(group) => group.id}
        filters={LISTING_GROUP_FILTER_SPEC}
        filterValues={filters}
        resetHref={dashboardPaths.tenant.listingGroups}
        pageSize={pageSize}
        emptyMessage={
          hasActiveFilters(filters) ? 'Không có tin đăng khớp bộ lọc.' : 'Chưa có tin đăng nào.'
        }
        pagination={{ page, pageSize, total, hrefFor: pageHref }}
      />
    </div>
  );
}

function RowActions({ group }: { group: ListingGroupResponse }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <fetcher.Form method="post" className="flex flex-wrap justify-end gap-1.5">
        <input type="hidden" name="id" value={group.id} />
        <Button asChild size="xs" variant="ghost">
          <Link to={`/tenant/listing-groups/${group.id}/review`}>
            <Eye data-icon="inline-start" /> Xem
          </Link>
        </Button>
        {group.status === 'pending_review' ? (
          <Button type="submit" name="intent" value="publish" size="xs" disabled={busy}>
            <Check data-icon="inline-start" /> Duyệt
          </Button>
        ) : null}
        {group.status === 'published' ? (
          <Button
            type="submit"
            name="intent"
            value="hide"
            size="xs"
            variant="outline"
            disabled={busy}
          >
            <EyeOff data-icon="inline-start" /> Ẩn
          </Button>
        ) : null}
        {group.status === 'archived' ? (
          <Button
            type="submit"
            name="intent"
            value="republish"
            size="xs"
            variant="outline"
            disabled={busy}
          >
            <Undo2 data-icon="inline-start" /> Đăng lại
          </Button>
        ) : null}
      </fetcher.Form>
      {error ? <p className="max-w-56 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
