import type { NotificationResponse } from '@booking/contracts';
import { Link } from 'react-router';
import { cn } from '@booking/ui/lib/utils';
import { notificationTargetPath } from '~/features/notifications/lib/notification-target';

interface Props {
  items: NotificationResponse[];
  onRead: (id: string) => void;
}

export function NotificationList({ items, onRead }: Props) {
  if (items.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Chưa có thông báo nào.</p>;
  }
  return (
    <ul className="divide-y">
      {items.map((item) => {
        const to = notificationTargetPath(item.targetType, item.targetId);
        const unread = item.readAt === null;
        const body = (
          <div className="flex items-start gap-2 px-4 py-3">
            <span
              aria-hidden
              className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')}
            />
            <div className="min-w-0">
              <p className={cn('truncate text-sm', unread ? 'font-semibold' : 'text-muted-foreground')}>
                {item.title}
              </p>
              {item.body ? <p className="truncate text-xs text-muted-foreground">{item.body}</p> : null}
            </div>
          </div>
        );
        return (
          <li key={item.id}>
            {to ? (
              <Link to={to} onClick={() => onRead(item.id)} className="block hover:bg-muted/50">
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
