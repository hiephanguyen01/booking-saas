import type { BookingStatus } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { cn } from '@booking/ui/lib/utils';
import { NsI18n, useTranslation } from '@booking/i18n';

/** Statuses that read as inactive or as money returned; every other status is live red. */
const STATUS_TONE: Partial<Record<BookingStatus, string>> = {
  draft: 'text-slate-600',
  expired: 'text-slate-600',
  refunded: 'text-violet-700',
};

const DEFAULT_TONE = 'text-destructive';

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useTranslation(NsI18n.Booking);
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-auto rounded-none border-transparent bg-transparent px-0 py-0 text-xs font-medium uppercase shadow-none',
        STATUS_TONE[status] ?? DEFAULT_TONE,
      )}
    >
      {t(`statusLabels.${status}`)}
    </Badge>
  );
}
