import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useFetcher, useLocation } from 'react-router';
import type { NotificationResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@booking/ui/components/ui/popover';
import { ScrollArea } from '@booking/ui/components/ui/scroll-area';
import { areaForPathname } from '~/features/notifications/lib/notification-area';
import { NotificationList } from './notification-list';

const POLL_MS = 60_000;

interface FeedData {
  count: number;
  items: NotificationResponse[];
}

/**
 * The shell bell. Polls `/notifications` every 60s, and PAUSES while the tab is
 * hidden so a backgrounded dashboard is silent. Data goes browser -> RR server
 * -> API through the resource route, never straight to the backend.
 */
export function NotificationBell() {
  const location = useLocation();
  const area = areaForPathname(location.pathname);
  const feed = useFetcher<FeedData>();
  const action = useFetcher();
  const [open, setOpen] = useState(false);

  const load = feed.load;
  useEffect(() => {
    if (!area) return;
    const url = `/notifications?area=${area}`;
    const tick = () => {
      if (!document.hidden) load(url);
    };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    // A tab that was hidden for an hour must not show an hour-old badge the
    // moment it is focused again.
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [area, load]);

  useEffect(() => {
    if (action.state === 'idle' && action.data && area) load(`/notifications?area=${area}`);
  }, [action.state, action.data, area, load]);

  if (!area) return null;

  const data = feed.data ?? { count: 0, items: [] };
  const submit = (body: Record<string, string>) =>
    action.submit(body, { method: 'post', action: '/notifications' });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Thông báo">
          <Bell className="size-5" />
          {data.count > 0 ? (
            <Badge
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center px-1 text-[10px]"
              aria-label={`${data.count} thông báo chưa đọc`}
            >
              {data.count > 99 ? '99+' : data.count}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-semibold">Thông báo</span>
          {data.count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => submit({ intent: 'read-all', area })}
            >
              Đánh dấu tất cả đã đọc
            </Button>
          ) : null}
        </div>
        <ScrollArea className="max-h-96">
          <NotificationList
            items={data.items}
            onRead={(id) => {
              setOpen(false);
              submit({ intent: 'read', id });
            }}
          />
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
