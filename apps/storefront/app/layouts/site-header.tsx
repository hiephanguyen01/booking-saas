import type { CurrentUser, PublicListingTypeResponse } from '@booking/contracts';
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
import { type Locale, NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths, switchLocalePath } from '../lib/locale-paths';
import type { StorefrontTenant } from '../lib/tenant.server';
import { TenantBrand } from './tenant-brand';

/** Shared sizing for the desktop nav controls, which are shorter than the Button default. */
const NAV_BUTTON = 'h-10 rounded-sm px-4 text-xs font-semibold';

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
            <Button asChild variant="outline" className={`${NAV_BUTTON} border-foreground`}>
              <Link to={storefrontPaths.bookings(locale)} prefetch="intent">
                <Search aria-hidden="true" className="size-4" />
                {t('lookup')}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className={`${NAV_BUTTON} border-primary text-primary hover:bg-primary/10 hover:text-primary`}
            >
              <Link to={storefrontPaths.becomePartner(locale)} prefetch="intent">
                {t('becomePartner')}
              </Link>
            </Button>
            {currentUser ? (
              <AuthenticatedActions currentUser={currentUser} locale={locale} />
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className={`${NAV_BUTTON} text-primary hover:bg-primary/10 hover:text-primary`}
                >
                  <Link to={storefrontPaths.login(locale, redirectTo)} prefetch="intent">
                    {t('login')}
                  </Link>
                </Button>
                <Button asChild className={NAV_BUTTON}>
                  <Link to={storefrontPaths.register(locale)} prefetch="intent">
                    {t('register')}
                  </Link>
                </Button>
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
  const { t } = useTranslation(NsI18n.Navigation);
  return (
    <Link
      to={storefrontPaths.home(locale)}
      prefetch="intent"
      aria-label={t('brandHome', { tenant: tenant.name })}
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
            ? 'flex items-center gap-2 rounded-sm px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10'
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
      <Button
        type="submit"
        variant="ghost"
        className={
          mobile
            ? 'h-auto justify-start rounded-sm px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive'
            : 'h-10 rounded-sm px-2 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive'
        }
      >
        {label}
      </Button>
    </fetcher.Form>
  );
}

function LocaleSwitcher({ current }: { current: Locale }) {
  const { t } = useTranslation(NsI18n.Navigation);
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
      <Button
        type="submit"
        variant="ghost"
        className="h-auto justify-start rounded-sm px-3 py-2.5 text-sm font-semibold uppercase text-muted-foreground"
        aria-label={t('switchLanguage', { locale: next })}
      >
        {current}
      </Button>
    </fetcher.Form>
  );
}
