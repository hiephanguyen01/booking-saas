import type { ComponentType } from 'react';
import { Link } from 'react-router';
import { CalendarDays, FileText, Repeat } from 'lucide-react';
import { cn } from '@booking/ui/lib/utils';
import { dashboardPaths } from '~/constants/paths';

export type ListingWorkspaceTab = 'detail' | 'calendar' | 'pricing';

interface WorkspaceNavItem {
  value: ListingWorkspaceTab;
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

const WORKSPACE_NAV_ITEMS: readonly WorkspaceNavItem[] = [
  { value: 'detail', label: 'Chi tiết', icon: FileText },
  { value: 'calendar', label: 'Lịch và giá', icon: CalendarDays },
  { value: 'pricing', label: 'Giá lặp lại', icon: Repeat },
];

function workspaceHref(listingId: string, tab: ListingWorkspaceTab): string {
  const base = dashboardPaths.partner.listing(listingId);
  return tab === 'detail' ? base : `${base}?tab=${tab}`;
}

export function ListingWorkspaceNav({
  listingId,
  activeTab,
}: {
  listingId: string;
  activeTab: ListingWorkspaceTab;
}) {
  return (
    <nav aria-label="Khu vực bài đăng" className="overflow-x-auto border-b">
      <div className="flex min-w-max items-stretch gap-1">
        {WORKSPACE_NAV_ITEMS.map((item) => {
          const active = item.value === activeTab;
          const Icon = item.icon;

          return (
            <Link
              key={item.value}
              to={workspaceHref(listingId, item.value)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative inline-flex min-h-11 items-center gap-2 rounded-t-lg px-3 text-sm whitespace-nowrap transition-colors sm:px-4',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                "after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-transparent after:content-['']",
                active
                  ? 'bg-primary/5 font-semibold text-foreground after:bg-primary'
                  : 'font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <Icon className={cn('size-4 shrink-0', active && 'text-primary')} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
