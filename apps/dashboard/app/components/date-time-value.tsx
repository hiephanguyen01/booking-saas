import { useEffect, useState } from 'react';
import { cn } from '@booking/ui/lib/utils';
import { formatDateTime, formatRelativeTime } from '~/lib/format';

export interface DateTimeValueProps {
  iso: string | null | undefined;
  /** Optional IANA zone for resource-local booking times; defaults to dashboard TZ. */
  timeZone?: string;
  /** Append a live "· 3 giờ trước" hint (client-only, so no hydration drift). */
  relative?: boolean;
  className?: string;
}

/**
 * A timezone-correct datetime with the same value in its `title`. General
 * dashboard timestamps use the market timezone; booking fields may supply their
 * resource timezone. When `relative` is set, a muted relative hint is added after
 * mount — never during SSR — so the server and client markup match.
 */
export function DateTimeValue({ iso, timeZone, relative, className }: DateTimeValueProps) {
  const absolute = formatDateTime(iso, timeZone);
  const rel = useRelativeTime(relative ? iso : null);
  return (
    <span className={cn('tabular-nums', className)} title={iso ? absolute : undefined}>
      {absolute}
      {rel ? <span className="ml-1 font-normal text-muted-foreground">· {rel}</span> : null}
    </span>
  );
}

export interface RelativeTimeValueProps {
  iso: string | null | undefined;
  /** Optional IANA zone for the `title` tooltip; defaults to dashboard TZ. */
  timeZone?: string;
  className?: string;
}

/**
 * Relative time ALONE ("5 phút trước"), with the exact timestamp in `title`.
 *
 * The inverse of `DateTimeValue`: use it where recency is the whole point and
 * the wall-clock value is only a hover-away detail — a notification row, an
 * activity feed. Renders the absolute value through SSR and first paint and
 * swaps to the relative label on mount, so it is safe on a server-rendered
 * screen even though the label depends on the reader's clock.
 */
export function RelativeTimeValue({ iso, timeZone, className }: RelativeTimeValueProps) {
  const absolute = formatDateTime(iso, timeZone);
  const rel = useRelativeTime(iso);
  return (
    <span className={cn('tabular-nums', className)} title={iso ? absolute : undefined}>
      {rel ?? absolute}
    </span>
  );
}

/** Relative label that stays `null` through SSR + first paint, then ticks. */
function useRelativeTime(iso: string | null | undefined): string | null {
  const [rel, setRel] = useState<string | null>(null);
  useEffect(() => {
    if (!iso) {
      setRel(null);
      return;
    }
    const update = (): void => setRel(formatRelativeTime(iso));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [iso]);
  return rel;
}
