import type { Paginated, PaymentHistoryItem } from '@booking/contracts';
import type { Route } from './+types/_index';
import { PaymentTransactionsPage } from '~/features/payments/components/payment-transactions-page';
import { readPaymentHistoryFilters } from '~/features/payments/lib/payment-history';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { apiGet } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giao dịch · Bookify Admin' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePlatform(request, 'platform.finance.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readPaymentHistoryFilters(url.searchParams);
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
