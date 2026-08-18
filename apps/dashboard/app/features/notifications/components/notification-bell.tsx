import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Link, useFetcher, useLocation } from 'react-router';
import type { NotificationArea, NotificationResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@booking/ui/components/ui/popover';
import { ScrollArea } from '@booking/ui/components/ui/scroll-area';
import { dashboardPaths } from '~/constants/paths';
import { areaForPathname } from '~/features/notifications/lib/notification-area';
import { NotificationList, NotificationListSkeleton } from './notification-list';

const POLL_MS = 60_000;

interface FeedData {
  count: number;
  items: NotificationResponse[];
}

/**
 * The full inbox behind the menu. `affiliate` is absent on purpose: the
 * affiliate portal has no notifications screen, so that bell shows its ten rows
 * and no footer rather than linking into a 404.
 */
const INBOX_PATH: Partial<Record<NotificationArea, string>> = {
  tenant: dashboardPaths.tenant.notifications,
  partner: dashboardPaths.partner.notifications,
};

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
  // Only the very first poll has nothing to draw; later polls keep the rows on
  // screen so a 60s refresh never flashes the menu back to skeletons.
  const loading = !feed.data && feed.state === 'loading';
  const inboxPath = INBOX_PATH[area];
  const submit = (body: Record<string, string>) =>
    action.submit(body, { method: 'post', action: '/notifications' });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Thông báo">
          <Bell className="size-5" />
          {data.count > 0 ? (
            <Badge
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center px-1 text-[10px] tabular-nums"
              aria-label={`${data.count} thông báo chưa đọc`}
            >
              {data.count > 99 ? '99+' : data.count}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] overflow-hidden p-0 sm:w-96">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Thông báo</span>
            {data.count > 0 ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
                {data.count > 99 ? '99+' : data.count} chưa đọc
              </Badge>
            ) : null}
          </div>
          {data.count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={action.state !== 'idle'}
              onClick={() => submit({ intent: 'read-all', area })}
            >
              <CheckCheck className="size-3.5" aria-hidden />
              Đánh dấu đã đọc
            </Button>
          ) : null}
        </div>

        {/* The cap goes on the VIEWPORT, not the root. Radix gives the viewport
            `h-full`, which against an auto-height root resolves to auto — so a
            `max-h` on the root only clips the overflow, it never makes the list
            scroll, and the rows run on under the footer. */}
        <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-[24rem]">
          {loading ? (
            <NotificationListSkeleton />
          ) : (
            <NotificationList
              items={data.items}
              variant="popover"
              onRead={(id) => {
                setOpen(false);
                submit({ intent: 'read', id });
              }}
            />
          )}
        </ScrollArea>

        {inboxPath ? (
          <div className="border-t">
            <Link
              to={inboxPath}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              Xem tất cả thông báo
            </Link>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
