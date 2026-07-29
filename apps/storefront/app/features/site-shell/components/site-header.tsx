import type { CurrentUser, PublicListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Search } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import type { AccountMenuSummary } from '~/features/account/lib/account-menu';
import { type Locale, NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import type { StorefrontTenant } from '~/lib/server/tenant.server';
import { TenantBrand } from './tenant-brand';
import { SiteHeaderAccountMenu } from './site-header-account-menu';
import { SiteHeaderMobileMenu } from './site-header-mobile-menu';

/** Shared sizing for the desktop nav controls, which are shorter than the Button default. */
const NAV_BUTTON = 'h-10 rounded-sm px-4 text-xs font-semibold';

/** Tenant-aware header shared by the storefront, customer auth, and partner flows. */
export function SiteHeader({
  tenant,
  listingTypes,
  locale,
  currentUser = null,
  accountMenuSummary = null,
}: {
  tenant: StorefrontTenant;
  listingTypes: PublicListingTypeResponse[];
  locale: Locale;
  currentUser?: CurrentUser | null;
  accountMenuSummary?: AccountMenuSummary | null;
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
              <SiteHeaderAccountMenu
                currentUser={currentUser}
                locale={locale}
                accountMenuSummary={accountMenuSummary}
              />
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

        <SiteHeaderMobileMenu
          brand={<BrandHomeLink locale={locale} tenant={tenant} />}
          listingTypes={listingTypes}
          locale={locale}
          currentUser={currentUser}
          redirectTo={redirectTo}
        />
      </div>
    </header>
  );
}

function BrandHomeLink({ locale, tenant }: { locale: Locale; tenant: StorefrontTenant }) {
  const { t } = useTranslation([NsI18n.Navigation]);
  return (
    <Link
      to={storefrontPaths.home(locale)}
      prefetch="intent"
      aria-label={t('brandHome', { tenant: tenant.name })}
      className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TenantBrand
        name={tenant.name}
        logoUrl={tenant.themeConfig.logoUrl || null}
        width={133}
        height={40}
      />
    </Link>
  );
}
