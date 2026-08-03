import type { FormEvent } from 'react';
import {
  paginatedSchema,
  partnerSettlementDisputeResponseSchema,
  respondSettlementDisputeInputSchema,
  type PartnerSettlementDisputeResponse,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { data, Form, useNavigation, useSearchParams, useSubmit } from 'react-router';
import type { Route } from './+types/disputes';
import { ErrorBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { ListToolbar } from '~/components/list-toolbar';
import { dashboardPaths } from '~/constants/paths';
import { requirePartner } from '~/features/partner/server/partner.server';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { apiGet, apiPost } from '~/lib/api.server';
import { formatDateTime } from '~/lib/format';
import { readListParams } from '~/lib/pagination';
import { readListFilters, type FilterSpec } from '~/lib/list-filters';
import { apiPaths } from '~/constants/api-paths';
import { DISPUTE_STATUS_FILTER_OPTIONS } from '~/constants/finance';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Khiếu nại booking · Partner · BookingOS' }];
}

const DISPUTE_FILTER_SPEC: FilterSpec = [
  { kind: 'text', key: 'q', label: 'Tìm kiếm', placeholder: 'Mã booking, dịch vụ, lý do…' },
  { kind: 'enum', key: 'status', label: 'Trạng thái', options: DISPUTE_STATUS_FILTER_OPTIONS },
  {
    kind: 'enum',
    key: 'responseStatus',
    label: 'Phản hồi',
    options: [
      { value: 'pending', label: 'Chưa phản hồi' },
      { value: 'responded', label: 'Đã phản hồi' },
    ],
  },
];

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.disputes.read');
  const list = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, DISPUTE_FILTER_SPEC);
  const result = await apiGet(apiPaths.partner.financeDisputes, auth, {
    query: list.toApiQuery(apiFilters),
    schema: paginatedSchema(partnerSettlementDisputeResponseSchema),
  });
  return {
    result: result.ok ? result.data : null,
    filters,
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
  const submit = useSubmit();
  const { busy, run } = useSubmissionGuard(navigation.state);
  const [searchParams] = useSearchParams();
  const { pageSize } = readListParams(searchParams);
  const result = loaderData.result;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  return (
    <div className="space-y-6" aria-busy={busy}>
      <PageHeader
        title="Khiếu nại booking"
        description="Cung cấp thông tin đối chiếu sớm để Tenant có đủ căn cứ xử lý khoản tiền đang bị khóa."
      />
      <ErrorBanner
        error={loaderData.error ?? (actionData && 'error' in actionData ? actionData.error : null)}
      />
      <ListToolbar
        spec={DISPUTE_FILTER_SPEC}
        filters={loaderData.filters}
        resetHref={dashboardPaths.partner.disputes}
        pageSize={pageSize}
      />
      {result?.items.map((item) => (
        <Card key={item.id}>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{item.listingTitle ?? 'Dịch vụ'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.bookingCode ?? item.bookingId.slice(0, 8)} · {formatDateTime(item.createdAt)}
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
              <Form method="post" className="space-y-3 border-t pt-4" onSubmit={handleSubmit}>
                <input type="hidden" name="disputeId" value={item.id} />
                <Textarea
                  name="response"
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={4}
                  placeholder="Mô tả quá trình cung cấp dịch vụ và các thông tin có thể đối chiếu..."
                  disabled={busy}
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={busy}>
                    {busy ? 'Đang gửi...' : 'Gửi phản hồi'}
                  </Button>
                </div>
              </Form>
            ) : null}
          </CardContent>
        </Card>
      ))}
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
