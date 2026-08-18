import type { NotificationResponse } from '@booking/contracts';
import { Link } from 'react-router';
import { BellOff, ChevronRight } from 'lucide-react';
import { Skeleton } from '@booking/ui/components/ui/skeleton';
import { cn } from '@booking/ui/lib/utils';
import { RelativeTimeValue } from '~/components/date-time-value';
import { notificationTargetPath } from '~/features/notifications/lib/notification-target';
import { notificationAppearance } from './notification-appearance';

interface Props {
  items: NotificationResponse[];
  onRead: (id: string) => void;
  /**
   * `popover` is the bell menu: tighter rows, one line of body. `page` is the
   * full inbox screen, which has the width to breathe. Same rows either way —
   * a notification must not read differently depending on where you opened it.
   */
  variant?: 'popover' | 'page';
}

export function NotificationList({ items, onRead, variant = 'page' }: Props) {
  const compact = variant === 'popover';

  if (items.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 px-6 text-center',
          compact ? 'py-10' : 'py-16',
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <BellOff className="size-5" aria-hidden />
        </span>
        <p className="text-sm font-medium">Chưa có thông báo nào</p>
        <p className="max-w-64 text-xs text-muted-foreground">
          Lượt đặt, tin đăng và đối soát mới sẽ xuất hiện ở đây.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {items.map((item) => {
        const to = notificationTargetPath(item.targetType, item.targetId);
        const unread = item.readAt === null;
        const { Icon, tile } = notificationAppearance(item.targetType, item.eventType);

        const body = (
          <div
            className={cn(
              'flex items-start gap-3 px-4',
              compact ? 'py-3' : 'py-4',
              // The unread tint is the row-level cue; the dot below repeats it
              // for anyone who cannot separate the two backgrounds.
              unread && 'bg-primary/4',
            )}
          >
            <span
              aria-hidden
              className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', tile)}
            >
              <Icon className="size-4.5" />
            </span>

            <div className="min-w-0 flex-1 space-y-0.5">
              <p
                className={cn(
                  'line-clamp-2 text-sm leading-snug',
                  unread ? 'font-semibold' : 'font-normal text-muted-foreground',
                )}
              >
                {item.title}
              </p>
              {item.body ? (
                <p
                  className={cn(
                    'text-xs leading-snug text-muted-foreground',
                    compact ? 'line-clamp-2' : 'line-clamp-3',
                  )}
                >
                  {item.body}
                </p>
              ) : null}
              <RelativeTimeValue
                iso={item.createdAt}
                className="block pt-0.5 text-xs text-muted-foreground/80"
              />
            </div>

            <div className="flex shrink-0 items-center gap-2 self-center">
              {unread ? (
                <span
                  className="size-2 rounded-full bg-primary"
                  aria-label="Chưa đọc"
                  role="img"
                />
              ) : null}
              {to ? (
                <ChevronRight
                  aria-hidden
                  className="size-4 text-muted-foreground/50 transition-transform group-hover/row:translate-x-0.5"
                />
              ) : null}
            </div>
          </div>
        );

        return (
          <li key={item.id}>
            {to ? (
              <Link
                to={to}
                onClick={() => onRead(item.id)}
                className="group/row block transition-colors hover:bg-muted/60"
              >
                {body}
              </Link>
            ) : (
              // Target type this dashboard build does not know — still readable,
              // just not clickable. Never throw inside the shell.
              <div>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Row-shaped placeholders for the bell's first load, so the popover opens at
 * roughly its final height instead of snapping from an empty box to a full list.
 */
export function NotificationListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="divide-y" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <Skeleton className="size-9 shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}
