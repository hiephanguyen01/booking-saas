import type { Paginated, PaymentHistoryItem } from '@booking/contracts';
import { data as routeData } from 'react-router';
import type { Route } from './+types/_index';
import { PaymentTransactionsPage } from '~/features/payments/components/payment-transactions-page';
import { PAYMENT_FILTER_SPEC } from '~/features/payments/lib/payment-filters';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { apiGet } from '~/lib/api.server';
import { apiPost } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';
import { readListFilters } from '~/lib/list-filters';
import { apiPaths } from '~/constants/api-paths';
import {
  ManualRefundBreakGlassPanel,
  manualRefundBreakGlassFormSchema,
} from '~/features/payments/components/manual-refund-break-glass-panel';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giao dịch · BookingOS Admin' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePlatform(request, 'platform.finance.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, PAYMENT_FILTER_SPEC);
  const response = await apiGet<Paginated<PaymentHistoryItem>>(apiPaths.platform.payments, auth, {
    query: toApiQuery(apiFilters),
  });
  return {
    filters,
    result: response.ok ? response.data : null,
    error: response.ok ? null : (response.error ?? 'Không tải được lịch sử giao dịch.'),
    canBreakGlass: can('platform.refunds.break_glass'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePlatform(request, 'platform.refunds.break_glass');
  const parsed = manualRefundBreakGlassFormSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return routeData(
      { error: 'Cần đủ tenant, operation, phiên bản và lý do khẩn cấp hợp lệ.' },
      { status: 400 },
    );
  }
  const { tenantId, operationId, ...input } = parsed.data;
  const result = await apiPost<unknown>(
    apiPaths.platform.manualRefundBreakGlass(tenantId, operationId),
    input,
    auth,
    { signal: request.signal },
  );
  if (!result.ok) {
    return routeData(
      { error: result.error ?? 'Không thể hoàn tất break-glass.' },
      { status: result.status || 400 },
    );
  }
  return routeData({ success: 'Batch đã hoàn tất bằng break-glass và được audit mức cao.' });
}

export default function PlatformTransactions({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <PaymentTransactionsPage
      area="platform"
      {...loaderData}
      supplementary={
        loaderData.canBreakGlass ? (
          <ManualRefundBreakGlassPanel
            error={actionData && 'error' in actionData ? actionData.error : null}
            success={actionData && 'success' in actionData ? actionData.success : null}
          />
        ) : undefined
      }
    />
  );
}
