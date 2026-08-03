import { Link, useSearchParams } from 'react-router';
import type { Paginated, PromotionResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Plus, ArrowUpRight } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { useTenantArea } from '~/features/tenant/lib/area-context';
import { formatDiscount } from '~/lib/format';
import { PageHeader } from '~/components/page-header';
import { PromotionStatusBadge } from '~/components/status-badge';
import { EnumValue } from '~/components/enum-value';
import { SCOPE_LABELS } from '~/constants/promotion';
import { readListParams } from '~/lib/pagination';
import { readListFilters, hasActiveFilters } from '~/lib/list-filters';
import { PROMOTION_FILTER_SPEC } from '~/features/promotions/lib/promotion-filters';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { dashboardPaths } from '~/constants/paths';
import { apiPaths } from '~/constants/api-paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Khuyến mãi · Tenant · BookingOS' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.promotions.manage');
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, PROMOTION_FILTER_SPEC);
  const res = await apiGet<Paginated<PromotionResponse>>(apiPaths.tenant.promotions, auth, {
    query: toApiQuery(apiFilters),
  });
  return {
    result: res.ok ? res.data : null,
    filters,
    error: res.ok ? null : (res.error ?? 'Không tải được danh sách khuyến mãi.'),
  };
}

export default function TenantPromotions({ loaderData }: Route.ComponentProps) {
  const { result, error, filters } = loaderData;
  const { readOnly } = useTenantArea();
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  const promotions = result?.items ?? [];
  const total = result?.total ?? 0;

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
          <Link to={dashboardPaths.tenant.promotion(p.id)}>
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
          <Button asChild disabled={readOnly} aria-disabled={readOnly}>
            <Link to={dashboardPaths.tenant.promotionNew}><Plus className="size-4" /> Tạo mã mới</Link>
          </Button>
        }
      />

      {error ? (
        <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>
      ) : null}

      <DashboardDataTable
        columns={columns}
        data={promotions}
        getRowKey={(promotion) => promotion.id}
        filters={PROMOTION_FILTER_SPEC}
        filterValues={filters}
        resetHref={dashboardPaths.tenant.promotions}
        pageSize={pageSize}
        emptyMessage={
          hasActiveFilters(filters)
            ? 'Không có mã khớp bộ lọc.'
            : 'Chưa có mã khuyến mãi nào. Nhấn "Tạo mã mới" để tạo chương trình đầu tiên.'
        }
        pagination={{ page, pageSize, total, hrefFor: pageHref }}
      />
    </div>
  );
}
