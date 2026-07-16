import { Clock, TriangleAlert } from 'lucide-react';
import { cn } from '@booking/ui/lib/utils';
import { formatDateTime } from '~/lib/format';

export interface StatusTimestampProps {
  /** What the timestamp marks, e.g. "Hết hạn giữ chỗ". */
  label: string;
  iso: string | null | undefined;
  /** Tint the icon + time with the warning token (e.g. an imminent expiry). */
  urgent?: boolean;
  className?: string;
}

/**
 * A labelled timestamp that turns warning-toned when `urgent` — for deadlines
 * like a pending booking's `expiresAt`. Uses the themeable `--warning` token,
 * never hardcoded amber.
 */
export function StatusTimestamp({ label, iso, urgent, className }: StatusTimestampProps) {
  const Icon = urgent ? TriangleAlert : Clock;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <Icon
        className={cn('size-3.5 shrink-0', urgent ? 'text-warning' : 'text-muted-foreground')}
        aria-hidden
      />
      <span className="text-muted-foreground">{label}</span>
      <time className={cn('font-medium tabular-nums', urgent ? 'text-warning' : 'text-foreground')}>
        {formatDateTime(iso)}
      </time>
    </span>
  );
}
