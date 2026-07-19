import {
  adminSettlementDisputeResponseSchema,
  paginatedSchema,
  type AdminSettlementDisputeResponse,
  type Paginated,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { NativeSelect } from '@booking/ui/components/ui/native-select';
import { Form, useSearchParams } from 'react-router';
import type { Route } from './+types/disputes';
import { ErrorBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { apiGet } from '~/lib/api.server';
import { formatDateTime } from '~/lib/format';
import { readListParams } from '~/lib/pagination';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giám sát khiếu nại · Bookify Admin' }];
}
export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePlatform(request, 'platform.disputes.read');
  const list = readListParams(url.searchParams);
  const result = await apiGet('/platform/finance/disputes', auth, {
    query: list.toApiQuery({
      status: url.searchParams.get('status') || undefined,
      responseStatus: url.searchParams.get('responseStatus') || undefined,
      q: url.searchParams.get('q') || undefined,
    }),
    schema: paginatedSchema(adminSettlementDisputeResponseSchema),
  });
  return {
    result: result.ok ? result.data : null,
    error: result.ok ? null : (result.error ?? 'Không tải được khiếu nại.'),
  };
}
export default function AdminDisputes({ loaderData }: Route.ComponentProps) {
  const result = loaderData.result as Paginated<AdminSettlementDisputeResponse> | null;
  const [searchParams] = useSearchParams();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Giám sát khiếu nại"
        description="Theo dõi các khoản tiền đang bị khóa và tiến độ xử lý giữa khách hàng, Partner và Tenant."
      />
      <ErrorBanner error={loaderData.error} />
      <Form method="get" className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <Input
          name="q"
          defaultValue={searchParams.get('q') ?? ''}
          placeholder="Tenant, booking, dịch vụ, lý do..."
          className="min-w-64"
        />
        <NativeSelect name="status" defaultValue={searchParams.get('status') ?? ''}>
          <option value="">Tất cả trạng thái</option>
          <option value="open">Đang xử lý</option>
          <option value="accepted">Đã chấp nhận</option>
          <option value="rejected">Đã từ chối</option>
        </NativeSelect>
        <NativeSelect name="responseStatus" defaultValue={searchParams.get('responseStatus') ?? ''}>
          <option value="">Tất cả phản hồi</option>
          <option value="pending">Partner chưa phản hồi</option>
          <option value="responded">Partner đã phản hồi</option>
        </NativeSelect>
        <Button type="submit" variant="outline">
          Lọc
        </Button>
      </Form>
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
