import { useMemo, useState } from 'react';
import { Link, useFetcher, data as routeData } from 'react-router';
import type { AffiliateListItem, AffiliateStatusDto } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Badge } from '@booking/ui/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Check, Eye, Ban } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatDate, formatVnd } from '../format';
import { PageHeader } from '../components/page';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Cộng tác viên · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.affiliates.manage');
  const res = await apiGet<AffiliateListItem[]>('/tenant/affiliates', auth);
  return {
    affiliates: res.ok ? (res.data ?? []) : [],
    error: res.ok ? null : (res.error ?? 'Không tải được danh sách cộng tác viên.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.affiliates.manage');
  const form = await request.formData();
  const id = String(form.get('id'));
  const status = String(form.get('status'));
  if (status !== 'approved' && status !== 'suspended') {
    return routeData({ error: 'Trạng thái không hợp lệ.' }, { status: 400 });
  }
  const res = await apiPost(`/tenant/affiliates/${id}/status`, { status }, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Không cập nhật được trạng thái.' }, { status: 400 });
  return { ok: true };
}

type Filter = 'all' | AffiliateStatusDto;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'suspended', label: 'Tạm ngưng' },
];

const STATUS_LABEL: Record<AffiliateStatusDto, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  suspended: 'Tạm ngưng',
};

function AffiliateStatusBadge({ status }: { status: AffiliateStatusDto }) {
  const variant = status === 'approved' ? 'default' : status === 'pending' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}

export default function TenantAffiliates({ loaderData }: Route.ComponentProps) {
  const { affiliates, error } = loaderData;
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: affiliates.length };
    for (const a of affiliates) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [affiliates]);

  const rows = useMemo(
    () => (filter === 'all' ? affiliates : affiliates.filter((a) => a.status === filter)),
    [filter, affiliates],
  );

  const columns: DataTableColumn<AffiliateListItem>[] = [
    {
      header: 'Cộng tác viên',
      cell: (a) => (
        <div className="min-w-0">
          <Link to={`/tenant/affiliates/${a.id}`} className="truncate font-medium hover:underline">
            {a.userName}
          </Link>
          <div className="truncate text-xs text-muted-foreground">{a.userEmail}</div>
        </div>
      ),
    },
    {
      header: 'Link',
      cell: (a) => <span className="text-sm tabular-nums text-muted-foreground">{a.linksCount}</span>,
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: 'Đã kiếm',
      cell: (a) => <span className="text-sm tabular-nums">{formatVnd(a.totalEarned)}</span>,
      className: 'hidden md:table-cell',
      headClassName: 'hidden md:table-cell',
    },
    {
      header: 'Hoa hồng riêng',
      cell: (a) => (
        <span className="text-sm text-muted-foreground">{a.customRate === null ? '—' : `${a.customRate}%`}</span>
      ),
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
    { header: 'Trạng thái', cell: (a) => <AffiliateStatusBadge status={a.status} /> },
    {
      header: 'Tham gia',
      cell: (a) => <span className="text-sm text-muted-foreground">{formatDate(a.createdAt)}</span>,
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (a) => <RowActions affiliate={a} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cộng tác viên"
        description="Duyệt cộng tác viên, đặt hoa hồng riêng và theo dõi hoa hồng đã phát sinh."
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
        getRowKey={(a) => a.id}
        emptyMessage="Chưa có cộng tác viên nào trong nhóm này."
      />
    </div>
  );
}

function RowActions({ affiliate }: { affiliate: AffiliateListItem }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';

  return (
    <div className="flex items-center justify-end gap-1">
      {affiliate.status !== 'approved' ? (
        <fetcher.Form method="post">
          <input type="hidden" name="id" value={affiliate.id} />
          <input type="hidden" name="status" value="approved" />
          <Button type="submit" size="sm" disabled={busy}>
            <Check className="size-4" /> Duyệt
          </Button>
        </fetcher.Form>
      ) : (
        <fetcher.Form method="post">
          <input type="hidden" name="id" value={affiliate.id} />
          <input type="hidden" name="status" value="suspended" />
          <Button type="submit" variant="outline" size="sm" disabled={busy}>
            <Ban className="size-4" /> Tạm ngưng
          </Button>
        </fetcher.Form>
      )}
      <Button asChild variant="ghost" size="sm">
        <Link to={`/tenant/affiliates/${affiliate.id}`}>
          <Eye className="size-4" /> Xem
        </Link>
      </Button>
    </div>
  );
}
