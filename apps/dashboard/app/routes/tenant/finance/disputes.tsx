import {
  resolveSettlementDisputeInputSchema,
  type Paginated,
  type SettlementDisputeResponse,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { NativeSelect } from '@booking/ui/components/ui/native-select';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { ArrowLeft, ArrowUpRight, Scale } from 'lucide-react';
import { data as routeData, Form, Link, useNavigation, useSearchParams } from 'react-router';
import type { Route } from './+types/disputes';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { dashboardPaths } from '~/constants/paths';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiGet, apiPost } from '~/lib/api.server';
import { formatDateTime, formatVnd } from '~/lib/format';
import { readListParams } from '~/lib/pagination';

const STATUS_LABEL: Record<SettlementDisputeResponse['status'], string> = {
  open: 'Chờ xử lý',
  accepted: 'Chấp nhận',
  rejected: 'Từ chối',
  resolved: 'Đã giải quyết',
};

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tranh chấp · Tài chính · Tenant · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.disputes.read');
  const list = readListParams(url.searchParams);
  const result = await apiGet<Paginated<SettlementDisputeResponse>>(
    '/tenant/finance/disputes',
    auth,
    {
      query: list.toApiQuery({
        status: url.searchParams.get('status') || undefined,
        responseStatus: url.searchParams.get('responseStatus') || undefined,
        q: url.searchParams.get('q') || undefined,
      }),
    },
  );
  return {
    result: result.ok ? result.data : null,
    canResolve: can('tenant.disputes.resolve'),
    error: result.ok ? null : (result.error ?? 'Không tải được danh sách tranh chấp.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.disputes.resolve');
  const form = await request.formData();
  const disputeId = String(form.get('disputeId') ?? '');
  const parsed = resolveSettlementDisputeInputSchema.safeParse({
    resolution: form.get('resolution'),
    refundAmount: form.get('refundAmount') || undefined,
    note: form.get('note'),
  });
  if (!parsed.success) {
    return routeData(
      { error: 'Cần chọn phương án, nhập ghi chú và số tiền hoàn hợp lệ.' },
      { status: 400 },
    );
  }
  const result = await apiPost<SettlementDisputeResponse>(
    `/tenant/finance/disputes/${encodeURIComponent(disputeId)}/resolve`,
    parsed.data,
    auth,
  );
  if (!result.ok) {
    return routeData({ error: result.error ?? 'Không xử lý được tranh chấp.' }, { status: 400 });
  }
  return { ok: true };
}

export default function TenantDisputes({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const list = readListParams(searchParams);
  const items = loaderData.result?.items ?? [];
  const actionError = actionData && 'error' in actionData ? actionData.error : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tranh chấp thanh toán"
        description="Mỗi tranh chấp đang mở sẽ khóa khoản đối soát tương ứng cho đến khi Tenant ra quyết định."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={dashboardPaths.tenant.finance}>
              <ArrowLeft className="size-4" /> Về tài chính
            </Link>
          </Button>
        }
      />
      <ErrorBanner error={actionError ?? loaderData.error} />

      <Form method="get" className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <Input
          name="q"
          defaultValue={searchParams.get('q') ?? ''}
          placeholder="Mã booking, dịch vụ, lý do..."
          className="min-w-64"
        />
        <NativeSelect name="status" defaultValue={searchParams.get('status') ?? ''}>
          <option value="">Tất cả trạng thái</option>
          <option value="open">Chờ xử lý</option>
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

      {items.length === 0 ? (
        <Card>
          <CardContent className="grid min-h-36 place-items-center text-sm text-muted-foreground">
            Chưa có tranh chấp nào.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((dispute) => {
            const submitting =
              navigation.state === 'submitting' &&
              navigation.formData?.get('disputeId') === dispute.id;
            return (
              <Card key={dispute.id}>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Scale className="size-4 text-primary" />
                      <Link
                        to={dashboardPaths.tenant.booking(dispute.bookingId)}
                        className="hover:underline"
                      >
                        {dispute.bookingCode ?? dispute.bookingId.slice(0, 8)}
                      </Link>
                      <ArrowUpRight className="size-3.5" />
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {dispute.listingTitle ?? '—'} · {dispute.customerName ?? '—'} · Partner{' '}
                      {dispute.partnerName ?? '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatVnd(dispute.remainingHeldAmount)}</p>
                    {dispute.remainingHeldAmount !== dispute.onlineHeldAmount ? (
                      <p className="text-xs text-muted-foreground">
                        Đã giữ ban đầu {formatVnd(dispute.onlineHeldAmount)}
                      </p>
                    ) : null}
                    <Badge variant={dispute.status === 'open' ? 'destructive' : 'secondary'}>
                      {STATUS_LABEL[dispute.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md bg-muted/50 p-4 text-sm leading-6">
                    <p>{dispute.reason}</p>
                    {dispute.evidence.length ? (
                      <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                        {dispute.evidence.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Gửi lúc {formatDateTime(dispute.createdAt)}
                    </p>
                  </div>
                  {dispute.partnerResponse ? (
                    <div className="rounded-md border border-primary/20 p-4 text-sm leading-6">
                      <p className="font-medium">Phản hồi của Partner</p>
                      <p className="mt-1 text-muted-foreground">{dispute.partnerResponse}</p>
                      {dispute.partnerRespondedAt ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Gửi lúc {formatDateTime(dispute.partnerRespondedAt)}
                        </p>
                      ) : null}
                    </div>
                  ) : dispute.status === 'open' ? (
                    <p className="text-xs text-muted-foreground">Partner chưa gửi phản hồi.</p>
                  ) : null}

                  {dispute.status === 'open' && loaderData.canResolve ? (
                    <Form method="post" className="grid gap-3 border-t pt-4 md:grid-cols-2">
                      <input type="hidden" name="disputeId" value={dispute.id} />
                      <div className="space-y-1.5">
                        <Label htmlFor={`resolution-${dispute.id}`}>Quyết định</Label>
                        <NativeSelect id={`resolution-${dispute.id}`} name="resolution" required>
                          <option value="release">Từ chối — tiếp tục đối soát</option>
                          <option value="full_refund">Chấp nhận — hoàn toàn bộ</option>
                          <option value="partial_refund">Chấp nhận — hoàn một phần</option>
                        </NativeSelect>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`refund-${dispute.id}`}>Số tiền hoàn một phần</Label>
                        <Input
                          id={`refund-${dispute.id}`}
                          name="refundAmount"
                          type="number"
                          min="1"
                          max={dispute.remainingHeldAmount}
                          placeholder="Chỉ nhập khi hoàn một phần"
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label htmlFor={`note-${dispute.id}`}>Căn cứ xử lý</Label>
                        <Textarea
                          id={`note-${dispute.id}`}
                          name="note"
                          required
                          maxLength={2000}
                          rows={3}
                        />
                      </div>
                      <div className="md:col-span-2 md:text-right">
                        <Button type="submit" disabled={submitting}>
                          {submitting ? 'Đang xử lý…' : 'Xác nhận quyết định'}
                        </Button>
                      </div>
                    </Form>
                  ) : dispute.resolutionNote ? (
                    <div className="border-t pt-4 text-sm">
                      <p className="font-medium">Kết quả: {dispute.resolution}</p>
                      <p className="mt-1 text-muted-foreground">{dispute.resolutionNote}</p>
                      {dispute.refundAmount !== '0' ? (
                        <p className="mt-1">Hoàn khách: {formatVnd(dispute.refundAmount)}</p>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PaginationBar
        page={list.page}
        pageSize={list.pageSize}
        total={loaderData.result?.total ?? 0}
        hrefFor={list.pageHref}
      />
    </div>
  );
}
