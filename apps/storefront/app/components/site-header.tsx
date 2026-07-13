import { Link, NavLink, useFetcher, useLocation } from 'react-router';
import { LayoutGrid, Search, type LucideIcon } from 'lucide-react';
import type { PublicListingTypeResponse } from '@booking/shared';
import { cn } from '@booking/ui/lib/utils';
import type { StorefrontTenant } from '../lib/tenant.server';
import type { Locale } from '../lib/i18n';
import { useT } from '../lib/i18n';
import { typeIcon } from '../lib/ui';

/** Storefront navigation — logo + a category bar auto-generated from listing types. */
export function SiteHeader({
  tenant,
  listingTypes,
  locale,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
}) {
  const { t } = useT();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-(--sf-background)/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md text-xl font-extrabold tracking-tight text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="h-8 w-auto max-w-40 object-contain" />
            ) : (
              tenant.name
            )}
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/bookings"
              className="hidden items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex"
            >
              <Search className="size-4" />
              {t('nav.lookup')}
            </Link>
            <LocaleSwitcher current={locale} />
          </div>
        </div>
        <nav className="-mx-1 flex items-center gap-1 overflow-x-auto pb-3">
          <CategoryLink to="/" label={t('nav.all')} icon={LayoutGrid} end />
          {listingTypes.map((type) => (
            <CategoryLink key={type.id} to={`/t/${type.slug}`} label={type.name} icon={typeIcon(type.slug)} />
          ))}
        </nav>
      </div>
    </header>
  );
}

/** vi/en switcher — posts to the `set-locale` action which sets the cookie + redirects back. */
function LocaleSwitcher({ current }: { current: Locale }) {
  const fetcher = useFetcher();
  const location = useLocation();
  const next: Locale = current === 'vi' ? 'en' : 'vi';
  const redirectTo = `${location.pathname}${location.search}`;
  return (
    <fetcher.Form method="post" action="/set-locale">
      <input type="hidden" name="locale" value={next} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        type="submit"
        className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground uppercase transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Switch language to ${next}`}
      >
        {current}
      </button>
    </fetcher.Form>
  );
}

function CategoryLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      <Icon className="size-4" />
      {label}
    </NavLink>
  );
}
