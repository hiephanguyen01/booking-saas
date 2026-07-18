import {
  paymentKindSchema,
  paymentRecordStatusSchema,
  type PaymentHistoryQuery,
} from '@booking/contracts';
import { TZ_OFFSET } from '~/constants/time';

export interface PaymentHistoryFilters {
  search: string;
  status: PaymentHistoryQuery['status'] | '';
  kind: PaymentHistoryQuery['kind'] | '';
  from: string;
  to: string;
}

function boundIso(day: string, edge: 'start' | 'end'): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
  const value = new Date(`${day}T${time}${TZ_OFFSET}`);
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
}

export function readPaymentHistoryFilters(searchParams: URLSearchParams): {
  filters: PaymentHistoryFilters;
  apiFilters: Omit<PaymentHistoryQuery, 'page' | 'pageSize'>;
} {
  const search = searchParams.get('search')?.trim() ?? '';
  const statusResult = paymentRecordStatusSchema.safeParse(searchParams.get('status'));
  const kindResult = paymentKindSchema.safeParse(searchParams.get('kind'));
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const status = statusResult.success ? statusResult.data : '';
  const kind = kindResult.success ? kindResult.data : '';
  return {
    filters: { search, status, kind, from, to },
    apiFilters: {
      search: search || undefined,
      status: status || undefined,
      kind: kind || undefined,
      from: boundIso(from, 'start'),
      to: boundIso(to, 'end'),
    },
  };
}
