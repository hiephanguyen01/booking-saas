import { data as routeData, Link, useFetcher } from 'react-router';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_PAGE_SIZE, type ListingTypeResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiDelete, apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { PageHeader } from '~/components/page-header';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { SEARCH_SCHEDULE_LABEL } from '~/features/tenant/constants';
import { readListFilters, hasActiveFilters, type FilterSpec } from '~/lib/list-filters';
import { ListToolbar } from '~/components/list-toolbar';
import { dashboardPaths } from '~/constants/paths';

const LISTING_TYPE_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Tên loại…' },
];

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Loại dịch vụ · Tenant · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.listings.read');
  const { filters, apiFilters } = readListFilters(url.searchParams, LISTING_TYPE_FILTER_SPEC);
  const res = await apiGet<ListingTypeResponse[]>('/tenant/listing-types', auth, {
    query: { includeInactive: 'true', ...apiFilters },
  });
  return {
    types: res.ok ? (res.data ?? []) : [],
    canWrite: can('tenant.listings.write'),
    filters,
    error: res.ok ? null : (res.error ?? 'Không tải được loại dịch vụ.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.write');
  const form = await request.formData();
  if (String(form.get('intent')) === 'delete') {
    const res = await apiDelete(`/tenant/listing-types/${String(form.get('id'))}`, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không xoá được (có thể đang được dùng).' }, { status: 400 });
    return { ok: true };
  }
  return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}

export default function TenantListingTypes({ loaderData, actionData }: Route.ComponentProps) {
  const { types, canWrite, error, filters } = loaderData;
  const actionError = actionData && 'error' in actionData ? actionData.error : null;

  const columns: DataTableColumn<ListingTypeResponse>[] = [
    {
      header: 'Tên',
      cell: (t) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{t.name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{t.slug}</p>
        </div>
      ),
    },
    {
      header: 'Hình thức',
      cell: (t) => (
        <div className="flex flex-wrap gap-1">
          {t.allowedModes.map((m) => (
            <Badge key={m} variant="outline" className="font-normal">{BOOKING_MODE_LABEL[m] ?? m}</Badge>
          ))}
        </div>
      ),
    },
    { header: 'Thuộc tính', cell: (t) => <span className="tabular-nums text-muted-foreground">{t.attributeSchema.length}</span> },
    {
      header: 'Tìm kiếm',
      cell: (t) => {
        const facetCount =
          t.searchConfig.systemFacets.length + t.searchConfig.attributeFacets.length;
        return (
          <div className="space-y-1">
            <Badge variant="outline" className="font-normal">
              {SEARCH_SCHEDULE_LABEL[t.searchConfig.schedule]}
            </Badge>
            <p className="whitespace-nowrap text-xs text-muted-foreground">
              {facetCount} bộ lọc{t.searchConfig.showGuests ? ' · có số khách' : ''}
            </p>
          </div>
        );
      },
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
    {
      header: 'Đang dùng',
      cell: (t) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          <span className="tabular-nums text-foreground">{t.listingCount}</span> tin đăng
        </span>
      ),
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: 'Trạng thái',
      cell: (t) => (t.isActive ? <Badge>Đang bật</Badge> : <Badge variant="outline">Tắt</Badge>),
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (t) => (canWrite ? <RowActions type={t} /> : null),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Loại dịch vụ"
        description="Định nghĩa các loại dịch vụ của bạn (studio, model, thuê thiết bị…) và thuộc tính của chúng."
        actions={
          canWrite ? (
            <Button asChild size="sm">
              <Link to="/tenant/listing-types/new"><Plus className="size-4" /> Thêm loại</Link>
            </Button>
          ) : null
        }
      />
      {error || actionError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error ?? actionError}
        </div>
      ) : null}
      <ListToolbar
        spec={LISTING_TYPE_FILTER_SPEC}
        filters={filters}
        resetHref={dashboardPaths.tenant.listingTypes}
        pageSize={DEFAULT_PAGE_SIZE}
      />
      <DataTable
        columns={columns}
        data={types}
        getRowKey={(t) => t.id}
        emptyMessage={
          hasActiveFilters(filters) ? 'Không có loại dịch vụ khớp bộ lọc.' : 'Chưa có loại dịch vụ nào.'
        }
      />
    </div>
  );
}

function RowActions({ type }: { type: ListingTypeResponse }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  // A type in use cannot be deleted (FK-protected) — disable up-front instead of
  // firing a request the backend will refuse.
  const inUse = type.listingCount > 0;
  return (
    <div className="flex justify-end gap-1.5">
      <Button asChild size="xs" variant="ghost">
        <Link to={`/tenant/listing-types/${type.id}/edit`}><Pencil className="size-3.5" /> Sửa</Link>
      </Button>
      <fetcher.Form
        method="post"
        onSubmit={(e) => {
          if (!confirm(`Xoá loại “${type.name}”?`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="id" value={type.id} />
        <Button
          type="submit"
          size="xs"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          disabled={busy || inUse}
          title={inUse ? `Đang được ${type.listingCount} tin đăng sử dụng — không thể xoá.` : undefined}
        >
          <Trash2 className="size-3.5" /> Xoá
        </Button>
      </fetcher.Form>
    </div>
  );
}
