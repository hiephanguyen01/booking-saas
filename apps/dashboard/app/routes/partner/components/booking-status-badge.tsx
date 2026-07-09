import type { BookingStatus } from '@booking/shared';
import { Badge } from '@booking/ui/components/ui/badge';
import { cn } from '@booking/ui/lib/utils';
import { statusMeta } from './format';

/** Colour-coded booking status pill, consistent across every partner screen. */
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const meta = statusMeta(status);
  return (
    <Badge variant={meta.badge} className="gap-1.5">
      <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
    </Badge>
  );
}
