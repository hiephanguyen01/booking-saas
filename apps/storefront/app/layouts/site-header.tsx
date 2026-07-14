import type { PublicListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@booking/ui/components/ui/sheet';
import { LayoutGrid, Menu, Search } from 'lucide-react';
import { Link, NavLink, useFetcher, useLocation } from 'react-router';
import type { Locale } from '../lib/i18n';
import { useT } from '../lib/i18n';
import type { StorefrontTenant } from '../lib/tenant.server';
import { typeIcon } from '../lib/ui';
import { storefrontPaths, switchLocalePath } from '../lib/locale-paths';

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

  const logo = tenant.logoUrl ? (
    <img src={tenant.logoUrl} alt={tenant.name} className="h-8 w-auto max-w-40 object-contain" />
  ) : (
    tenant.name
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-(--sf-background)/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6">
        {/* Desktop */}
        <div className="hidden h-16 items-center justify-between gap-4 md:flex">
          <Link
            to={storefrontPaths.home(locale)}
            className="flex items-center gap-2 rounded-md text-xl font-extrabold tracking-tight text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {logo}
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to={storefrontPaths.bookings(locale)}
              className="hidden items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:flex"
            >
              <Search className="size-4" />
              {t('nav.lookup')}
            </Link>
            {/* Decorative placeholder — no customer auth exists on the storefront yet. */}
            <span className="rounded-md border border-foreground/30 px-4 py-2.5 text-xs font-semibold text-foreground">
              {t('nav.community')}
            </span>
            <Link
              to={storefrontPaths.becomePartner(locale)}
              className="rounded-md border border-primary px-4 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              {t('nav.becomePartner')}
            </Link>
            {/* Decorative placeholders — no customer auth exists on the storefront yet. */}
            <span className="px-2 text-xs font-semibold text-primary">{t('nav.login')}</span>
            <span className="rounded-md bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground">
              {t('nav.register')}
            </span>
            <LocaleSwitcher current={locale} />
          </div>
        </div>
        {/* <nav className="-mx-1 hidden items-center gap-1 overflow-x-auto pb-3 md:flex">
          <CategoryLink to="/" label={t('nav.all')} icon={LayoutGrid} end />
          {listingTypes.map((type) => (
            <CategoryLink key={type.id} to={`/t/${type.slug}`} label={type.name} icon={typeIcon(type.slug)} />
          ))}
        </nav> */}

        {/* Mobile */}
        <Sheet>
          <div className="flex h-14 items-center justify-between md:hidden">
            {/* <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t('nav.openMenu')}>
                <Menu className="size-5" />
              </Button>
            </SheetTrigger> */}
            <Link to={storefrontPaths.home(locale)} className="flex items-center gap-2 text-lg font-extrabold text-primary">
              {logo}
            </Link>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t('nav.openMenu')}>
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
          </div>
          <SheetContent side="left" className="w-80">
            <SheetTitle className="sr-only">{t('nav.openMenu')}</SheetTitle>
            <div className="flex flex-col gap-1 overflow-y-auto p-4">
              <SheetClose asChild>
                <NavLink
                  to={storefrontPaths.home(locale)}
                  end
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  <LayoutGrid className="size-4" />
                  {t('nav.all')}
                </NavLink>
              </SheetClose>
              {listingTypes.map((type) => {
                const Icon = typeIcon(type.slug);
                return (
                  <SheetClose asChild key={type.id}>
                    <NavLink
                      to={storefrontPaths.catalog(locale, type.slug)}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      <Icon className="size-4" />
                      {type.name}
                    </NavLink>
                  </SheetClose>
                );
              })}
              <SheetClose asChild>
                <Link
                  to={storefrontPaths.bookings(locale)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  <Search className="size-4" />
                  {t('nav.lookup')}
                </Link>
              </SheetClose>
              <div className="my-2 border-t border-border" />
              <SheetClose asChild>
                <Link
                  to={storefrontPaths.becomePartner(locale)}
                  className="rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
                >
                  {t('nav.becomePartner')}
                </Link>
              </SheetClose>
              {/* Decorative placeholders — no customer auth exists on the storefront yet. */}
              <span className="rounded-md px-3 py-2 text-sm font-medium text-foreground">
                {t('nav.community')}
              </span>
              <span className="rounded-md px-3 py-2 text-sm font-medium text-foreground">{t('nav.login')}</span>
              <span className="rounded-md px-3 py-2 text-sm font-medium text-foreground">
                {t('nav.register')}
              </span>
              <div className="my-2 border-t border-border" />
              <LocaleSwitcher current={locale} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

/** vi/en switcher — posts to the `set-locale` action which sets the cookie + redirects back. */
function LocaleSwitcher({ current }: { current: Locale }) {
  const fetcher = useFetcher();
  const location = useLocation();
  const next: Locale = current === 'vi' ? 'en' : 'vi';
  const redirectTo = switchLocalePath(`${location.pathname}${location.search}${location.hash}`, next);
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
