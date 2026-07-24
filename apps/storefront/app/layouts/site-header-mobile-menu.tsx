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
import type { ReactNode } from 'react';
import { NavLink, useFetcher, useLocation } from 'react-router';
import { accountNavItems } from '../features/account/account-nav';
import { type Locale, NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths, switchLocalePath } from '../lib/locale-paths';
import { SiteHeaderAccountAvatar, SiteHeaderLogoutForm } from './site-header-account-menu';

export function SiteHeaderMobileMenu({
  brand,
  listingTypes,
  locale,
  currentUser,
  redirectTo,
}: {
  brand: ReactNode;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  currentUser: CurrentUser | null;
  redirectTo: string;
}) {
  const { t } = useTranslation(NsI18n.Navigation);

  return (
    <Sheet>
      <div className="flex h-18 items-center justify-between lg:hidden">
        {brand}
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
              <div className="flex items-center gap-3 px-3 py-3">
                <SiteHeaderAccountAvatar currentUser={currentUser} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {currentUser.fullName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {currentUser.email}
                  </p>
                </div>
              </div>
              <MobileNavLink to={storefrontPaths.community(locale)}>
                <Globe2 aria-hidden="true" className="size-4" />
                {t('community')}
              </MobileNavLink>
              <MobileAccountLinks locale={locale} />
              <SiteHeaderLogoutForm locale={locale} label={t('logout')} mobile />
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
  );
}

function MobileAccountLinks({ locale }: { locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <>
      {accountNavItems(locale).map((item) => (
        <MobileNavLink key={item.key} to={item.to}>
          {t(`nav.${item.key}`)}
        </MobileNavLink>
      ))}
    </>
  );
}

function MobileNavLink({
  to,
  children,
  emphasized = false,
}: {
  to: string;
  children: ReactNode;
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
