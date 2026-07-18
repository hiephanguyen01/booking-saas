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
import { readPaymentHistoryFilters } from '~/features/payments/lib/payment-history';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiGet } from '~/lib/api.server';
import { apiPost } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';
import { RefundsPanel } from '~/features/payments/components/refunds-panel';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giao dịch · Tài chính · Tenant · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.finance.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readPaymentHistoryFilters(url.searchParams);
  const [response, refundsResponse] = await Promise.all([
    apiGet<Paginated<PaymentHistoryItem>>('/tenant/payments', auth, {
      query: toApiQuery(apiFilters),
    }),
    apiGet<Paginated<RefundHistoryItem>>('/tenant/payments/refunds', auth, {
      query: { page: 1, pageSize: 100 },
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
    return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
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
