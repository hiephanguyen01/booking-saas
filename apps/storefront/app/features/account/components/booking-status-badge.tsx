import type { BookingStatus } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { NsI18n, useTranslation } from '../../../lib/i18n';

const STATUS_CLASS: Record<BookingStatus, string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  pending_approval: 'border-amber-200 bg-amber-50 text-amber-800',
  pending_payment: 'border-orange-200 bg-orange-50 text-orange-800',
  confirmed: 'border-blue-200 bg-blue-50 text-blue-800',
  cancelled: 'border-red-200 bg-red-50 text-red-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  no_show: 'border-red-200 bg-red-50 text-red-800',
  rejected: 'border-red-200 bg-red-50 text-red-800',
  expired: 'border-slate-200 bg-slate-50 text-slate-700',
  refunded: 'border-violet-200 bg-violet-50 text-violet-800',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useTranslation(NsI18n.Booking);
  return (
    <Badge
      variant="outline"
      className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}
    >
      {t(`statusLabels.${status}`)}
    </Badge>
  );
}
