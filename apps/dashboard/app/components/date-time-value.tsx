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
