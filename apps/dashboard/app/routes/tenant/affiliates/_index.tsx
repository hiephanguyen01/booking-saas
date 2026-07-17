import { useMemo, useState } from 'react';
import { Link, useFetcher, data as routeData } from 'react-router';
import type { AffiliateListItem, AffiliateStatusDto } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Check, Eye, Ban } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { formatRate } from '~/lib/format';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { PartnerStatusBadge } from '~/components/status-badge';

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
          <Link
            to={`/tenant/affiliates/${a.id}`}
            className="truncate rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {a.userName}
          </Link>
          <div className="truncate text-xs text-muted-foreground">{a.userEmail}</div>
        </div>
      ),
    },
    {
      header: 'Click',
      cell: (a) => <span className="text-sm tabular-nums text-muted-foreground">{a.clicks}</span>,
      className: 'hidden sm:table-cell text-right',
      headClassName: 'hidden sm:table-cell text-right',
    },
    {
      header: 'Chuyển đổi',
      cell: (a) => <span className="text-sm tabular-nums text-muted-foreground">{formatRate(a.conversionRate)}</span>,
      className: 'hidden lg:table-cell text-right',
      headClassName: 'hidden lg:table-cell text-right',
    },
    {
      header: 'Cần chi',
      cell: (a) => <Money value={a.confirmedCommission} className="text-sm" />,
      className: 'hidden md:table-cell text-right',
      headClassName: 'hidden md:table-cell text-right',
    },
    {
      header: 'Đã chi',
      cell: (a) => <span className="text-sm text-muted-foreground"><Money value={a.paidCommission} /></span>,
      className: 'hidden lg:table-cell text-right',
      headClassName: 'hidden lg:table-cell text-right',
    },
    {
      header: 'Hoa hồng riêng',
      cell: (a) => (
        <span className="text-sm text-muted-foreground">{a.customRate === null ? '—' : `${a.customRate}%`}</span>
      ),
      className: 'hidden xl:table-cell',
      headClassName: 'hidden xl:table-cell',
    },
    { header: 'Trạng thái', cell: (a) => <PartnerStatusBadge status={a.status} /> },
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
        description="Duyệt cộng tác viên, đặt hoa hồng riêng và theo dõi hoa hồng cần chi trả."
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
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
