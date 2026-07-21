import {
  adminSettlementDisputeResponseSchema,
  paginatedSchema,
  type AdminSettlementDisputeResponse,
  type Paginated,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { useSearchParams } from 'react-router';
import type { Route } from './+types/disputes';
import { ErrorBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { ListToolbar } from '~/components/list-toolbar';
import { dashboardPaths } from '~/constants/paths';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { apiGet } from '~/lib/api.server';
import { formatDateTime } from '~/lib/format';
import { readListParams } from '~/lib/pagination';
import { readListFilters, type FilterSpec } from '~/lib/list-filters';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giám sát khiếu nại · Bookify Admin' }];
}

const DISPUTE_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Tenant, booking, dịch vụ, lý do…' },
  {
    kind: 'enum',
    key: 'status',
    label: 'Trạng thái',
    options: [
      { value: 'open', label: 'Đang xử lý' },
      { value: 'accepted', label: 'Đã chấp nhận' },
      { value: 'rejected', label: 'Đã từ chối' },
    ],
  },
  {
    kind: 'enum',
    key: 'responseStatus',
    label: 'Phản hồi',
    options: [
      { value: 'pending', label: 'Partner chưa phản hồi' },
      { value: 'responded', label: 'Partner đã phản hồi' },
    ],
  },
];

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePlatform(request, 'platform.disputes.read');
  const list = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, DISPUTE_FILTER_SPEC);
  const result = await apiGet('/platform/finance/disputes', auth, {
    query: list.toApiQuery(apiFilters),
    schema: paginatedSchema(adminSettlementDisputeResponseSchema),
  });
  return {
    result: result.ok ? result.data : null,
    filters,
    error: result.ok ? null : (result.error ?? 'Không tải được khiếu nại.'),
  };
}
export default function AdminDisputes({ loaderData }: Route.ComponentProps) {
  const result = loaderData.result as Paginated<AdminSettlementDisputeResponse> | null;
  const [searchParams] = useSearchParams();
  const { pageSize } = readListParams(searchParams);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Giám sát khiếu nại"
        description="Theo dõi các khoản tiền đang bị khóa và tiến độ xử lý giữa khách hàng, Partner và Tenant."
      />
      <ErrorBanner error={loaderData.error} />
      <ListToolbar
        spec={DISPUTE_FILTER_SPEC}
        filters={loaderData.filters}
        resetHref={dashboardPaths.admin.disputes}
        pageSize={pageSize}
      />
      {result?.items.map((item) => (
        <Card key={item.id}>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-semibold">{item.tenantName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.bookingCode ?? item.bookingId.slice(0, 8)} ·{' '}
                  {item.listingTitle ?? 'Dịch vụ'} · {formatDateTime(item.createdAt)}
                </p>
              </div>
              <div className="text-right">
                <Money value={item.remainingHeldAmount} className="font-semibold" />
                <div className="mt-1">
                  <Badge variant={item.status === 'open' ? 'destructive' : 'secondary'}>
                    {item.status === 'open' ? 'Đang xử lý' : 'Đã kết luận'}
                  </Badge>
                </div>
              </div>
            </div>
            <p className="rounded-md bg-muted/60 p-3 text-sm leading-6">{item.reason}</p>
            {item.partnerResponse ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Partner:</span> {item.partnerResponse}
              </p>
            ) : null}
            {item.resolutionNote ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Tenant:</span> {item.resolutionNote}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
      {result && result.items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Chưa có khiếu nại.
          </CardContent>
        </Card>
      ) : null}
      {result ? (
        <PaginationBar
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          hrefFor={({ page, pageSize }) => {
            const next = new URLSearchParams(searchParams);
            next.set('page', String(page));
            next.set('pageSize', String(pageSize));
            return `?${next.toString()}`;
          }}
        />
      ) : null}
    </div>
  );
}
