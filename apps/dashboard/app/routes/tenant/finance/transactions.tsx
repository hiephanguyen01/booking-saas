import {
  confirmManualRefundInputSchema,
  type Paginated,
  type PaymentHistoryItem,
  type RefundHistoryItem,
  type RefundResponse,
} from '@booking/contracts';
import { data as routeData } from 'react-router';
import type { Route } from './+types/transactions';
import { PaymentTransactionsPage } from '~/features/payments/components/payment-transactions-page';
import { PAYMENT_FILTER_SPEC } from '~/features/payments/lib/payment-filters';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiGet } from '~/lib/api.server';
import { apiPost } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';
import { readListFilters } from '~/lib/list-filters';
import { RefundsPanel } from '~/features/payments/components/refunds-panel';
import { apiPaths, FETCH_ALL_PAGE_SIZE } from '~/constants/api-paths';
import { actionMessages } from '~/constants/messages';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giao dịch · Tài chính · Tenant · BookingOS' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.finance.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, PAYMENT_FILTER_SPEC);
  const [response, refundsResponse] = await Promise.all([
    apiGet<Paginated<PaymentHistoryItem>>(apiPaths.tenant.payments, auth, {
      query: toApiQuery(apiFilters),
    }),
    apiGet<Paginated<RefundHistoryItem>>(apiPaths.tenant.paymentRefunds, auth, {
      query: { page: 1, pageSize: FETCH_ALL_PAGE_SIZE },
    }),
  ]);
  return {
    filters,
    result: response.ok ? response.data : null,
    error: response.ok ? null : (response.error ?? 'Không tải được lịch sử giao dịch.'),
    refunds: refundsResponse.ok ? (refundsResponse.data?.items ?? []) : [],
    refundError: refundsResponse.ok
      ? null
      : (refundsResponse.error ?? 'Không tải được lịch sử hoàn tiền.'),
    canManageRefunds: can('tenant.payouts.manage'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.payouts.manage');
  const form = await request.formData();
  if (form.get('intent') !== 'confirm-refund') {
    return routeData({ error: actionMessages.invalidIntent }, { status: 400 });
  }
  const refundId = String(form.get('refundId') ?? '');
  const parsed = confirmManualRefundInputSchema.safeParse({
    reference: form.get('reference'),
    evidenceKey: form.get('evidenceKey') || undefined,
    note: form.get('note') || undefined,
  });
  if (!parsed.success) {
    return routeData({ error: 'Cần mã tham chiếu hoàn tiền hợp lệ.' }, { status: 400 });
  }
  const result = await apiPost<RefundResponse>(
    `/tenant/payments/refunds/${encodeURIComponent(refundId)}/confirm`,
    parsed.data,
    auth,
  );
  if (!result.ok) {
    return routeData({ error: result.error ?? 'Không xác nhận được hoàn tiền.' }, { status: 400 });
  }
  return { ok: true };
}

export default function TenantTransactions({ loaderData, actionData }: Route.ComponentProps) {
  const actionError = actionData && 'error' in actionData ? actionData.error : null;
  return (
    <PaymentTransactionsPage
      area="tenant"
      {...loaderData}
      supplementary={
        <RefundsPanel
          refunds={loaderData.refunds}
          canManage={loaderData.canManageRefunds}
          error={actionError ?? loaderData.refundError}
        />
      }
    />
  );
}
