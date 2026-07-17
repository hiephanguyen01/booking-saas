import { Form, Link } from 'react-router';
import { Plus, Search } from 'lucide-react';
import type { Paginated, TenantResponse, TenantStatus, Vertical } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { NativeSelect } from '@booking/ui/components/ui/native-select';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { TENANT_STATUS_LABELS, VERTICAL_LABELS } from '~/constants/tenancy';
import { PageHeader } from '~/components/page-header';
import { DateTimeValue } from '~/components/date-time-value';
import { TenantStatusBadge } from '~/components/status-badge';
import { parsePage, pageHref } from '~/lib/pagination';
import { PaginationBar } from '~/components/pagination-bar';
import { ErrorBanner } from '~/components/action-feedback';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tenant · Bookify Admin' }];
}

const PAGE_SIZE = 20;

const STATUS_VALUES: TenantStatus[] = ['active', 'suspended', 'expired'];
const VERTICAL_VALUES: Vertical[] = ['studio', 'rental', 'classes'];

export async function loader({ request, url }: Route.LoaderArgs) {
  const page = parsePage(url.searchParams);
  const search = url.searchParams.get('search')?.trim() ?? '';
  const status = url.searchParams.get('status') ?? '';
  const vertical = url.searchParams.get('vertical') ?? '';

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) query.set('search', search);
  if (STATUS_VALUES.includes(status as TenantStatus)) query.set('status', status);
  if (VERTICAL_VALUES.includes(vertical as Vertical)) query.set('vertical', vertical);

  const { auth } = await requirePlatform(request, 'platform.tenants.read');
  const res = await apiGet<Paginated<TenantResponse>>(`/admin/tenants?${query}`, auth);
  return {
    page,
    filters: { search, status, vertical },
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

/** Build a querystring that resets to page 1 whenever a filter changes. */
function keepFilters(filters: { search: string; status: string; vertical: string }): string {
  const q = new URLSearchParams();
  if (filters.search) q.set('search', filters.search);
  if (filters.status) q.set('status', filters.status);
  if (filters.vertical) q.set('vertical', filters.vertical);
  return q.toString();
}

export default function TenantsList({ loaderData }: Route.ComponentProps) {
  const { result, error, page, filters } = loaderData;
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterQs = keepFilters(filters);

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

      <Form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <Label htmlFor="search">Tìm kiếm</Label>
          <Input
            id="search"
            name="search"
            type="search"
            placeholder="Tên hoặc slug tenant…"
            defaultValue={filters.search}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          <NativeSelect id="status" name="status" defaultValue={filters.status}>
            <option value="">Tất cả</option>
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {TENANT_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vertical">Loại hình</Label>
          <NativeSelect id="vertical" name="vertical" defaultValue={filters.vertical}>
            <option value="">Tất cả</option>
            {VERTICAL_VALUES.map((v) => (
              <option key={v} value={v}>
                {VERTICAL_LABELS[v]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          <Search className="size-4" />
          Lọc
        </Button>
        {filterQs ? (
          <Button asChild variant="ghost">
            <Link to="/admin/tenants">Xoá lọc</Link>
          </Button>
        ) : null}
      </Form>

      <ErrorBanner error={error ? <>Không tải được danh sách tenant: {error}</> : null} />

      <DataTable
        columns={columns}
        data={items}
        getRowKey={(t) => t.id}
        emptyMessage={
          filterQs
            ? 'Không có tenant khớp bộ lọc.'
            : 'Chưa có tenant nào. Tạo tenant đầu tiên để bắt đầu.'
        }
      />

      <PaginationBar page={page} totalPages={totalPages} hrefFor={(p) => pageHref(filterQs, p)} />
    </div>
  );
}
