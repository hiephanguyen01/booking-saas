import type { CurrentUser, PublicListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@booking/ui/components/ui/sheet';
import { Globe2, LayoutGrid, Menu, Search } from 'lucide-react';
import { Link, NavLink, useFetcher, useLocation } from 'react-router';
import { type Locale, NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths, switchLocalePath } from '../lib/locale-paths';
import type { StorefrontTenant } from '../lib/tenant.server';
import { TenantBrand } from './tenant-brand';

/** Tenant-aware header shared by the storefront, customer auth, and partner flows. */
export function SiteHeader({
  tenant,
  listingTypes,
  locale,
  currentUser = null,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  currentUser?: CurrentUser | null;
}) {
  const { t } = useTranslation(NsI18n.Navigation);
  const location = useLocation();
  const redirectTo = `${location.pathname}${location.search}`;

  return (
    <header className="sticky top-0 z-40 bg-background font-studio text-foreground shadow-sm">
      <div className="mx-auto w-full max-w-292.5 px-4 sm:px-6 xl:px-0">
        <div className="hidden h-18 items-center justify-between lg:flex">
          <BrandHomeLink locale={locale} tenant={tenant} />

          <nav aria-label={t('mainNavigation')} className="flex items-center gap-4">
            <Link
              to={storefrontPaths.bookings(locale)}
              prefetch="intent"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-foreground px-4 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search aria-hidden="true" className="size-4" />
              {t('lookup')}
            </Link>
            <span className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-foreground px-4 text-xs font-semibold text-foreground shadow-xs">
              <Globe2 aria-hidden="true" className="size-4" />
              {t('community')}
            </span>
            <Link
              to={storefrontPaths.becomePartner(locale)}
              prefetch="intent"
              className="inline-flex h-10 items-center justify-center rounded-sm border border-primary px-4 text-xs font-semibold text-primary shadow-xs transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('becomePartner')}
            </Link>
            {currentUser ? (
              <AuthenticatedActions currentUser={currentUser} locale={locale} />
            ) : (
              <>
                <Link
                  to={storefrontPaths.login(locale, redirectTo)}
                  prefetch="intent"
                  className="inline-flex h-10 items-center justify-center rounded-sm px-4 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('login')}
                </Link>
                <Link
                  to={storefrontPaths.register(locale)}
                  prefetch="intent"
                  className="inline-flex h-10 items-center justify-center rounded-sm bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('register')}
                </Link>
              </>
            )}
          </nav>
        </div>

        <Sheet>
          <div className="flex h-18 items-center justify-between lg:hidden">
            <BrandHomeLink locale={locale} tenant={tenant} />
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t('openMenu')}>
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
          </div>
          <SheetContent side="right" className="w-80 font-studio" showCloseButton>
            <SheetTitle className="sr-only">{t('openMenu')}</SheetTitle>
            <div className="flex flex-col gap-1 overflow-y-auto px-4 pb-6 pt-14">
              <MobileNavLink to={storefrontPaths.home(locale)}>
                <LayoutGrid aria-hidden="true" className="size-4" />
                {t('all')}
              </MobileNavLink>
              {listingTypes.map((type) => (
                <MobileNavLink key={type.id} to={storefrontPaths.catalog(locale, type.slug)}>
                  {type.name}
                </MobileNavLink>
              ))}
              <MobileNavLink to={storefrontPaths.bookings(locale)}>
                <Search aria-hidden="true" className="size-4" />
                {t('lookup')}
              </MobileNavLink>
              <div className="my-2 h-px bg-border" />
              <MobileNavLink to={storefrontPaths.becomePartner(locale)} emphasized>
                {t('becomePartner')}
              </MobileNavLink>
              {currentUser ? (
                <>
                  <span className="px-3 py-2 text-sm font-semibold text-foreground">
                    {currentUser.fullName}
                  </span>
                  <MobileNavLink to={storefrontPaths.bookings(locale)} emphasized>
                    {t('myBookings')}
                  </MobileNavLink>
                  <LogoutForm locale={locale} label={t('logout')} mobile />
                </>
              ) : (
                <>
                  <MobileNavLink to={storefrontPaths.login(locale, redirectTo)}>
                    {t('login')}
                  </MobileNavLink>
                  <MobileNavLink to={storefrontPaths.register(locale)} emphasized>
                    {t('register')}
                  </MobileNavLink>
                </>
              )}
              <div className="my-2 h-px bg-border" />
              <LocaleSwitcher current={locale} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

function BrandHomeLink({ locale, tenant }: { locale: Locale; tenant: StorefrontTenant }) {
  return (
    <Link
      to={storefrontPaths.home(locale)}
      prefetch="intent"
      aria-label={`${tenant.name} - Trang chủ`}
      className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TenantBrand name={tenant.name} logoUrl={tenant.logoUrl} width={133} height={40} />
    </Link>
  );
}

function AuthenticatedActions({
  currentUser,
  locale,
}: {
  currentUser: CurrentUser;
  locale: Locale;
}) {
  const { t } = useTranslation(NsI18n.Navigation);
  return (
    <>
      <span className="max-w-36 truncate text-xs font-semibold text-foreground">
        {currentUser.fullName}
      </span>
      <Link
        to={storefrontPaths.bookings(locale)}
        prefetch="intent"
        className="px-2 text-xs font-semibold text-primary"
      >
        {t('myBookings')}
      </Link>
      <LogoutForm locale={locale} label={t('logout')} />
    </>
  );
}

function MobileNavLink({
  to,
  children,
  emphasized = false,
}: {
  to: string;
  children: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <SheetClose asChild>
      <NavLink
        to={to}
        prefetch="intent"
        className={
          emphasized
            ? 'flex items-center gap-2 rounded-sm px-3 py-2.5 text-sm font-semibold text-primary hover:bg-accent'
            : 'flex items-center gap-2 rounded-sm px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted'
        }
      >
        {children}
      </NavLink>
    </SheetClose>
  );
}

function LogoutForm({
  locale,
  label,
  mobile = false,
}: {
  locale: Locale;
  label: string;
  mobile?: boolean;
}) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" action={storefrontPaths.logout(locale)}>
      <button
        type="submit"
        className={
          mobile
            ? 'rounded-sm px-3 py-2.5 text-sm font-medium text-destructive'
            : 'px-2 text-xs font-semibold text-destructive'
        }
      >
        {label}
      </button>
    </fetcher.Form>
  );
}

function LocaleSwitcher({ current }: { current: Locale }) {
  const fetcher = useFetcher();
  const location = useLocation();
  const next: Locale = current === 'vi' ? 'en' : 'vi';
  const redirectTo = switchLocalePath(
    `${location.pathname}${location.search}${location.hash}`,
    next,
  );
  return (
    <fetcher.Form method="post" action="/set-locale">
      <input type="hidden" name="locale" value={next} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        type="submit"
        className="rounded-sm px-3 py-2.5 text-sm font-semibold uppercase text-muted-foreground hover:bg-muted"
        aria-label={`Switch language to ${next}`}
      >
        {current}
      </button>
    </fetcher.Form>
  );
}
