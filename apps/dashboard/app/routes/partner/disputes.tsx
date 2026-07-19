import {
  paginatedSchema,
  partnerSettlementDisputeResponseSchema,
  respondSettlementDisputeInputSchema,
  type PartnerSettlementDisputeResponse,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { NativeSelect } from '@booking/ui/components/ui/native-select';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { data, Form, useNavigation, useSearchParams } from 'react-router';
import type { Route } from './+types/disputes';
import { ErrorBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { requirePartner } from '~/features/partner/server/partner.server';
import { apiGet, apiPost } from '~/lib/api.server';
import { formatDateTime } from '~/lib/format';
import { readListParams } from '~/lib/pagination';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Khiếu nại booking · Partner · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.disputes.read');
  const list = readListParams(url.searchParams);
  const result = await apiGet('/partner/finance/disputes', auth, {
    query: list.toApiQuery({
      status: url.searchParams.get('status') || undefined,
      responseStatus: url.searchParams.get('responseStatus') || undefined,
      q: url.searchParams.get('q') || undefined,
    }),
    schema: paginatedSchema(partnerSettlementDisputeResponseSchema),
  });
  return {
    result: result.ok ? result.data : null,
    canRespond: can('partner.disputes.respond'),
    error: result.ok ? null : (result.error ?? 'Không tải được khiếu nại.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request, 'partner.disputes.respond');
  const form = await request.formData();
  const disputeId = String(form.get('disputeId') ?? '');
  const parsed = respondSettlementDisputeInputSchema.safeParse({ response: form.get('response') });
  if (!parsed.success) return data({ error: 'Phản hồi cần ít nhất 10 ký tự.' }, { status: 400 });
  const result = await apiPost<PartnerSettlementDisputeResponse>(
    `/partner/finance/disputes/${encodeURIComponent(disputeId)}/respond`,
    parsed.data,
    auth,
  );
  return result.ok
    ? { ok: true }
    : data({ error: result.error ?? 'Không gửi được phản hồi.' }, { status: 400 });
}

export default function PartnerDisputes({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const result = loaderData.result;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Khiếu nại booking"
        description="Cung cấp thông tin đối chiếu sớm để Tenant có đủ căn cứ xử lý khoản tiền đang bị khóa."
      />
      <ErrorBanner
        error={loaderData.error ?? (actionData && 'error' in actionData ? actionData.error : null)}
      />
      <Form method="get" className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <input
          name="q"
          defaultValue={searchParams.get('q') ?? ''}
          placeholder="Mã booking, dịch vụ, lý do..."
          className="h-10 min-w-64 rounded-md border bg-background px-3 text-sm"
        />
        <NativeSelect name="status" defaultValue={searchParams.get('status') ?? ''}>
          <option value="">Tất cả trạng thái</option>
          <option value="open">Đang xử lý</option>
          <option value="accepted">Đã chấp nhận</option>
          <option value="rejected">Đã từ chối</option>
        </NativeSelect>
        <NativeSelect name="responseStatus" defaultValue={searchParams.get('responseStatus') ?? ''}>
          <option value="">Tất cả phản hồi</option>
          <option value="pending">Chưa phản hồi</option>
          <option value="responded">Đã phản hồi</option>
        </NativeSelect>
        <Button type="submit" variant="outline">
          Lọc
        </Button>
      </Form>
      {result?.items.map((item) => {
        const submitting =
          navigation.state === 'submitting' && navigation.formData?.get('disputeId') === item.id;
        return (
          <Card key={item.id}>
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.listingTitle ?? 'Dịch vụ'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.bookingCode ?? item.bookingId.slice(0, 8)} ·{' '}
                    {formatDateTime(item.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <Money value={item.remainingHeldAmount} className="font-semibold" />
                  <div className="mt-1">
                    <Badge variant={item.status === 'open' ? 'destructive' : 'secondary'}>
                      {item.status === 'open' ? 'Chờ Tenant xử lý' : 'Đã kết luận'}
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="rounded-md bg-muted/60 p-3 text-sm leading-6">{item.reason}</p>
              {item.partnerResponse ? (
                <div className="border-t pt-4 text-sm">
                  <p className="font-medium">Phản hồi của bạn</p>
                  <p className="mt-2 leading-6 text-muted-foreground">{item.partnerResponse}</p>
                </div>
              ) : item.status === 'open' && loaderData.canRespond ? (
                <Form method="post" className="space-y-3 border-t pt-4">
                  <input type="hidden" name="disputeId" value={item.id} />
                  <Textarea
                    name="response"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={4}
                    placeholder="Mô tả quá trình cung cấp dịch vụ và các thông tin có thể đối chiếu..."
                  />
                  <div className="flex justify-end">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Đang gửi...' : 'Gửi phản hồi'}
                    </Button>
                  </div>
                </Form>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
      {result && result.items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Chưa có khiếu nại phù hợp bộ lọc.
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
