import { Link, useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import type { Paginated, TenantResponse, TenantStatus, Vertical } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { TENANT_STATUS_LABELS, VERTICAL_LABELS } from '~/constants/tenancy';
import { PageHeader } from '~/components/page-header';
import { DateTimeValue } from '~/components/date-time-value';
import { TenantStatusBadge } from '~/components/status-badge';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { dashboardPaths } from '~/constants/paths';
import { readListParams } from '~/lib/pagination';
import { readListFilters, hasActiveFilters, type FilterSpec } from '~/lib/list-filters';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tenant · BookingOS Admin' }];
}

const STATUS_VALUES: TenantStatus[] = ['active', 'suspended', 'expired'];
const VERTICAL_VALUES: Vertical[] = ['studio', 'rental', 'classes', 'sport'];

const TENANTS_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'search', label: 'Tìm kiếm', placeholder: 'Tên hoặc slug tenant…' },
  {
    kind: 'enum',
    key: 'status',
    label: 'Trạng thái',
    options: STATUS_VALUES.map((s) => ({ value: s, label: TENANT_STATUS_LABELS[s] })),
  },
  {
    kind: 'enum',
    key: 'vertical',
    label: 'Loại hình',
    options: VERTICAL_VALUES.map((v) => ({ value: v, label: VERTICAL_LABELS[v] })),
  },
];

export async function loader({ request, url }: Route.LoaderArgs) {
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, TENANTS_FILTER_SPEC);

  const { auth } = await requirePlatform(request, 'platform.tenants.read');
  const res = await apiGet<Paginated<TenantResponse>>('/admin/tenants', auth, {
    query: toApiQuery(apiFilters),
  });
  return {
    filters,
    result: res.ok ? res.data : null,
    error: res.ok ? null : res.error,
  };
}

const columns: DataTableColumn<TenantResponse>[] = [
  {
    header: 'Tên tenant',
    cell: (t) => (
      <Link to={`/admin/tenants/${t.id}`} className="group inline-flex flex-col gap-0.5">
        <span className="font-medium underline-offset-4 group-hover:underline">{t.name}</span>
        <span className="text-xs text-muted-foreground">{t.slug}</span>
      </Link>
    ),
  },
  { header: 'Trạng thái', cell: (t) => <TenantStatusBadge status={t.status} /> },
  {
    header: 'Loại hình',
    cell: (t) => <span className="text-sm">{VERTICAL_LABELS[t.vertical] ?? t.vertical}</span>,
  },
  {
    header: 'Múi giờ',
    cell: (t) => <span className="text-sm text-muted-foreground">{t.defaultTimezone}</span>,
  },
  {
    header: 'Ngày tạo',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (t) => <DateTimeValue iso={t.createdAt} className="text-sm text-muted-foreground" />,
  },
];

export default function TenantsList({ loaderData }: Route.ComponentProps) {
  const { result, error, filters } = loaderData;
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const hasFilters = hasActiveFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenant"
        description={`${total} tenant trên nền tảng.`}
        actions={
          <Button asChild>
            <Link to="/admin/tenants/new">
              <Plus className="size-4" />
              Tạo tenant
            </Link>
          </Button>
        }
      />

      <DashboardDataTable
        columns={columns}
        data={items}
        getRowKey={(tenant) => tenant.id}
        filters={TENANTS_FILTER_SPEC}
        filterValues={filters}
        resetHref={dashboardPaths.admin.tenants}
        pageSize={pageSize}
        error={error ? <>Không tải được danh sách tenant: {error}</> : null}
        emptyMessage={
          hasFilters
            ? 'Không có tenant khớp bộ lọc.'
            : 'Chưa có tenant nào. Tạo tenant đầu tiên để bắt đầu.'
        }
        pagination={{ page, pageSize, total, hrefFor: pageHref }}
      />
    </div>
  );
}
