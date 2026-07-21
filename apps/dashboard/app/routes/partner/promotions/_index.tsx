import { data, Form, Link, useSearchParams } from 'react-router';
import type { Paginated, PromotionResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { HandCoins, Pencil, Plus } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { useBusy } from '~/hooks/use-busy';
import { PromotionStatusBadge } from '~/components/status-badge';
import { formatDiscount } from '~/lib/format';
import { PaginationBar } from '~/components/pagination-bar';
import { readListParams } from '~/lib/pagination';
import { readListFilters, hasActiveFilters } from '~/lib/list-filters';
import { PROMOTION_FILTER_SPEC } from '~/features/promotions/lib/promotion-filters';
import { ListToolbar } from '~/components/list-toolbar';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Khuyến mãi · Đối tác · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request, 'partner.promotions.manage');
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, PROMOTION_FILTER_SPEC);
  const [mine, pending] = await Promise.all([
    apiGet<Paginated<PromotionResponse>>('/partner/promotions', auth, {
      query: toApiQuery(apiFilters),
    }),
    apiGet<PromotionResponse[]>('/partner/promotions/pending-optin', auth),
  ]);
  return {
    result: mine.ok ? mine.data : null,
    pending: pending.ok ? (pending.data ?? []) : [],
    filters,
    error: mine.ok ? null : (mine.error ?? 'Không tải được khuyến mãi.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request, 'partner.promotions.manage');
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const id = String(form.get('promotionId'));
  const path =
    intent === 'opt-in' ? `/partner/promotions/${id}/opt-in` : `/partner/promotions/${id}/end`;
  const res = await apiPost(path, {}, auth);
  if (!res.ok) return data({ error: res.error ?? 'Thao tác thất bại.' }, { status: 400 });
  return { ok: true };
}

export default function PartnerPromotions({ loaderData, actionData }: Route.ComponentProps) {
  const { result, pending, error, filters } = loaderData;
  const busy = useBusy();
  const actionError = actionData && 'error' in actionData ? actionData.error : null;
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  const promotions = result?.items ?? [];
  const total = result?.total ?? 0;

  const columns: DataTableColumn<PromotionResponse>[] = [
    {
      header: 'Chương trình',
      cell: (p) => (
        <Link to={`/partner/promotions/${p.id}`} className="font-medium hover:underline">
          {p.name}
          {p.code ? (
            <span className="ml-2 text-muted-foreground">{p.code}</span>
          ) : (
            <Badge variant="outline" className="ml-2">
              Tự động
            </Badge>
          )}
        </Link>
      ),
    },
    {
      header: 'Giảm',
      cell: (p) => formatDiscount(p.discountType, p.discountValue),
    },
    { header: 'Trạng thái', cell: (p) => <PromotionStatusBadge status={p.status} /> },
    {
      header: '',
      cell: (p) => (
        <Button asChild variant="ghost" size="sm">
          <Link to={`/partner/promotions/${p.id}`}>
            <Pencil className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Khuyến mãi"
        description="Tạo mã giảm giá do bạn tài trợ cho tin đăng của mình."
        actions={
          <Button asChild>
            <Link to="/partner/promotions/new">
              <Plus className="size-4" /> Tạo khuyến mãi
            </Link>
          </Button>
        }
      />

      <ErrorBanner error={actionError} />

      {pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HandCoins className="size-5" /> Chờ bạn đồng ý tài trợ
            </CardTitle>
            <CardDescription>
              Cửa hàng tạo các khuyến mãi này với chi phí do bạn chịu — chỉ có hiệu lực sau khi bạn
              đồng ý.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
              >
                <div>
                  <p className="font-medium">
                    {p.name}{' '}
                    {p.code ? <span className="text-muted-foreground">({p.code})</span> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Giảm {formatDiscount(p.discountType, p.discountValue)}
                  </p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="opt-in" />
                  <input type="hidden" name="promotionId" value={p.id} />
                  <Button type="submit" size="sm" disabled={busy}>
                    Đồng ý tài trợ
                  </Button>
                </Form>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Khuyến mãi của bạn</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <ErrorBanner error={error} />
          ) : (
            <div className="space-y-4">
              <ListToolbar
                spec={PROMOTION_FILTER_SPEC}
                filters={filters}
                resetHref={dashboardPaths.partner.promotions}
                pageSize={pageSize}
              />
              <DataTable
                data={promotions}
                columns={columns}
                emptyMessage={
                  hasActiveFilters(filters)
                    ? 'Không có mã khớp bộ lọc.'
                    : 'Chưa có khuyến mãi nào. Nhấn "Tạo khuyến mãi" để tạo chương trình đầu tiên.'
                }
              />
              <PaginationBar page={page} pageSize={pageSize} total={total} hrefFor={pageHref} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
