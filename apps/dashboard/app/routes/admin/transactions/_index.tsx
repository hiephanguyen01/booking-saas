import type { Paginated, PaymentHistoryItem } from '@booking/contracts';
import type { Route } from './+types/_index';
import { PaymentTransactionsPage } from '~/features/payments/components/payment-transactions-page';
import { PAYMENT_FILTER_SPEC } from '~/features/payments/lib/payment-filters';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { apiGet } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';
import { readListFilters } from '~/lib/list-filters';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giao dịch · Bookify Admin' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePlatform(request, 'platform.finance.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, PAYMENT_FILTER_SPEC);
  const response = await apiGet<Paginated<PaymentHistoryItem>>('/platform/payments', auth, {
    query: toApiQuery(apiFilters),
  });
  return {
    filters,
    result: response.ok ? response.data : null,
    error: response.ok ? null : (response.error ?? 'Không tải được lịch sử giao dịch.'),
  };
}

export default function PlatformTransactions({ loaderData }: Route.ComponentProps) {
  return <PaymentTransactionsPage area="platform" {...loaderData} />;
}
