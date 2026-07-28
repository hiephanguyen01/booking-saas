import type { BookingStatus } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { NsI18n, useTranslation } from '@booking/i18n';

const STATUS_CLASS: Record<BookingStatus, string> = {
  draft: 'border-transparent bg-transparent text-slate-600',
  pending_approval: 'border-transparent bg-transparent text-[#ef4444]',
  pending_payment: 'border-transparent bg-transparent text-[#ef4444]',
  confirmed: 'border-transparent bg-transparent text-[#ef4444]',
  cancelled: 'border-transparent bg-transparent text-[#ef4444]',
  completed: 'border-transparent bg-transparent text-[#ef4444]',
  no_show: 'border-transparent bg-transparent text-[#ef4444]',
  rejected: 'border-transparent bg-transparent text-[#ef4444]',
  expired: 'border-transparent bg-transparent text-slate-600',
  refunded: 'border-transparent bg-transparent text-violet-700',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useTranslation(NsI18n.Booking);
  return (
    <Badge
      variant="outline"
      className={`h-auto rounded-none px-0 py-0 text-xs font-medium uppercase shadow-none ${STATUS_CLASS[status]}`}
    >
      {t(`statusLabels.${status}`)}
    </Badge>
  );
}
