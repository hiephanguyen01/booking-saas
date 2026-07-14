import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import type { Paginated, TenantResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { platformLoader } from '~/routes/admin/lib/api.server';
import { formatDate, VERTICAL_LABELS } from '~/routes/admin/lib/format';
import { PageHeader } from '~/routes/admin/components/page-header';
import { TenantStatusBadge } from '~/routes/admin/components/status-badge';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tenant · Bookify Admin' }];
}

const PAGE_SIZE = 20;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  return platformLoader(
    request,
    async (auth) => {
      const res = await apiGet<Paginated<TenantResponse>>(
        `/admin/tenants?page=${page}&pageSize=${PAGE_SIZE}`,
        auth,
      );
      return {
        page,
        result: res.ok ? res.data : null,
        error: res.ok ? null : res.error,
      };
    },
    'platform.tenants.read',
  );
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
    cell: (t) => (
      <span className="text-sm">{VERTICAL_LABELS[t.vertical] ?? t.vertical}</span>
    ),
  },
  {
    header: 'Múi giờ',
    cell: (t) => <span className="text-sm text-muted-foreground">{t.defaultTimezone}</span>,
  },
  {
    header: 'Ngày tạo',
    headClassName: 'text-right',
    className: 'text-right tabular-nums text-muted-foreground',
    cell: (t) => formatDate(t.createdAt),
  },
];

export default function TenantsList({ loaderData }: Route.ComponentProps) {
  const { result, error, page } = loaderData;
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Không tải được danh sách tenant: {error}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={items}
        getRowKey={(t) => t.id}
        emptyMessage="Chưa có tenant nào. Tạo tenant đầu tiên để bắt đầu."
      />

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Trang {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page <= 1}
              aria-disabled={page <= 1}
            >
              <Link to={`?page=${page - 1}`} prefetch="intent">
                Trước
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              aria-disabled={page >= totalPages}
            >
              <Link to={`?page=${page + 1}`} prefetch="intent">
                Sau
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
