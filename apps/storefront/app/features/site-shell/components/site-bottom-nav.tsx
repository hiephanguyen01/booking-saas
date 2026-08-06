import type { PublicListingTypeResponse } from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import { CalendarCheck, Home, Search, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { type Locale, NsI18n, useTranslation } from '@booking/i18n';
import {
  useSiteBottomNavController,
  type BottomNavKey,
} from '~/features/site-shell/hooks/use-site-bottom-nav-controller';

const ICONS: Record<BottomNavKey, LucideIcon> = {
  home: Home,
  search: Search,
  bookings: CalendarCheck,
  account: User,
};

/**
 * App-style tab bar, mobile only. It is what makes the installed PWA navigable:
 * in `display: standalone` there is no browser chrome and no back button, so the
 * hamburger sheet alone would leave a visitor with one way in and no way across.
 *
 * The sheet stays for everything four tabs cannot hold — listing types, becoming a
 * partner, community, logout, the language switch.
 *
 * `z-30` on purpose: shadcn's dialog and sheet overlays sit at `z-50`, so a
 * booking sheet still covers this bar instead of having tabs float over it.
 */
export function SiteBottomNav({
  listingTypes,
  locale,
  signedIn,
}: {
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  signedIn: boolean;
}) {
  const { t } = useTranslation(NsI18n.Navigation);
  const items = useSiteBottomNavController({ listingTypes, locale, signedIn });

  return (
    <nav
      aria-label={t('bottomNav.label')}
      // `pb-[env(...)]` clears the iPhone home indicator in standalone mode; it
      // resolves to 0 everywhere else, so nothing shifts in a browser tab.
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 font-studio pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {items.map((item) => {
          const Icon = ICONS[item.key];
          return (
            <li key={item.key} className="flex-1">
              <Link
                to={item.to}
                prefetch="intent"
                aria-current={item.active ? 'page' : undefined}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] leading-none font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  item.active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon
                  aria-hidden="true"
                  className="size-5.5"
                  // The active tab reads as filled in the mockup; lucide has no
                  // filled variants, so a translucent fill of the current colour
                  // does the same job without a second icon set.
                  fill={item.active ? 'currentColor' : 'none'}
                  fillOpacity={item.active ? 0.15 : undefined}
                />
                <span>{t(`bottomNav.${item.key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
