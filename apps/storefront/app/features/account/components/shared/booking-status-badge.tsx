import type { BookingStatus } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { cn } from '@booking/ui/lib/utils';
import { NsI18n, useTranslation } from '@booking/i18n';

/**
 * The one place a booking status becomes a colour in the storefront — the
 * counterpart to the dashboard's `components/status-badge.tsx`.
 *
 * `Record`, not `Partial<Record>`: adding a member to `bookingStatusSchema` is a
 * compile error here, so a status can never reach a customer wearing a fallback
 * colour that happened to be wrong. It used to be exactly that — three statuses
 * were muted and *everything else* fell through to `text-destructive`, which
 * told a customer their confirmed booking was in trouble.
 *
 * Tones are the themeable semantic tokens from `@booking/ui` globals.css, each
 * of which already carries a dark value, so a tenant on a dark background needs
 * no hand-written `dark:` pair here.
 */
type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE: Record<StatusTone, string> = {
  success: 'border-transparent bg-success/15 text-success',
  warning: 'border-transparent bg-warning/15 text-warning',
  danger: 'border-transparent bg-destructive/15 text-destructive',
  info: 'border-transparent bg-info/15 text-info',
  neutral: 'border-transparent bg-muted text-muted-foreground',
};

/**
 * Read from the customer's point of view, which is not the operator's: awaiting
 * payment is something they still owe (warning), while awaiting the partner is
 * simply in progress (info). `no_show`, `expired` and `refunded` are settled
 * outcomes they can no longer act on, so they read as closed rather than as
 * alarms.
 */
const STATUS_TONE: Record<BookingStatus, StatusTone> = {
  draft: 'neutral',
  pending_approval: 'info',
  pending_payment: 'warning',
  confirmed: 'success',
  completed: 'success',
  cancelled: 'danger',
  rejected: 'danger',
  no_show: 'neutral',
  expired: 'neutral',
  refunded: 'neutral',
};

export function BookingStatusBadge({
  status,
  className,
}: {
  status: BookingStatus;
  className?: string;
}) {
  const { t } = useTranslation(NsI18n.Booking);
  return (
    <Badge className={cn('font-medium', TONE[STATUS_TONE[status]], className)}>
      {t(`statusLabels.${status}`)}
    </Badge>
  );
}
