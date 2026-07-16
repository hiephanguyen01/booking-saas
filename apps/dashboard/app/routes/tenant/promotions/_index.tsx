import { Link } from 'react-router';
import type { PromotionResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Plus, ArrowUpRight } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { useTenantArea } from '../area-context';
import { formatDiscount } from '~/lib/format';
import { PageHeader } from '~/components/page-header';
import { PromotionStatusBadge } from '~/components/status-badge';
import { EnumValue } from '~/components/enum-value';
import { SCOPE_LABELS } from '../components/promotion-form';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Khuyến mãi · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.promotions.manage');
  const res = await apiGet<PromotionResponse[]>('/tenant/promotions', auth);
  return {
    promotions: res.ok ? (res.data ?? []) : [],
    error: res.ok ? null : (res.error ?? 'Không tải được danh sách khuyến mãi.'),
  };
}

export default function TenantPromotions({ loaderData }: Route.ComponentProps) {
  const { promotions, error } = loaderData;
  const { readOnly } = useTenantArea();

  const columns: DataTableColumn<PromotionResponse>[] = [
    {
      header: 'Chương trình',
      cell: (p) => (
        <div>
          <div className="font-medium">{p.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{p.code ?? 'Tự động áp dụng'}</div>
        </div>
      ),
    },
    { header: 'Giảm', cell: (p) => <span className="tabular-nums">{formatDiscount(p.discountType, p.discountValue)}</span> },
    {
      header: 'Phạm vi',
      cell: (p) => <EnumValue map={SCOPE_LABELS} value={p.appliesTo} className="text-sm text-muted-foreground" />,
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: 'Đã dùng',
      cell: (p) => (
        <span className="tabular-nums text-muted-foreground">
          {p.redeemedCount}
          {p.usageLimitTotal ? ` / ${p.usageLimitTotal}` : ''}
        </span>
      ),
    },
    { header: 'Trạng thái', cell: (p) => <PromotionStatusBadge status={p.status} /> },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (p) => (
        <Button asChild variant="ghost" size="sm">
          <Link to={`/tenant/promotions/${p.id}`}>
            Chi tiết <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Khuyến mãi"
        description="Tạo và theo dõi mã giảm giá cho cửa hàng của bạn."
        actions={
          <Button asChild size="sm" disabled={readOnly} aria-disabled={readOnly}>
            <Link to="/tenant/promotions/new"><Plus className="size-4" /> Tạo mã mới</Link>
          </Button>
        }
      />

      {error ? (
        <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>
      ) : null}

      <DataTable columns={columns} data={promotions} getRowKey={(p) => p.id} emptyMessage="Chưa có mã khuyến mãi nào." />
    </div>
  );
}
