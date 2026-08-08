import type { CurrentUser, PublicListingTypeResponse } from '@booking/contracts';
import { type Locale, NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { Search } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import type { AccountMenuSummary } from '~/features/account/lib/account-menu';
import { useOverlayHeader } from '~/features/site-shell/hooks/use-overlay-header';
import type { StorefrontTenant } from '~/lib/server/tenant.server';
import { SiteHeaderAccountMenu } from './site-header-account-menu';
import { SiteHeaderMobileMenu } from './site-header-mobile-menu';
import { TenantBrand } from './tenant-brand';

/** Shared sizing for the desktop nav controls, which are shorter than the Button default. */
const NAV_BUTTON = 'h-10 rounded-sm px-4 text-xs font-semibold';

/**
 * The glass treatment every control wears while the header floats on a photo.
 * A tenant-coloured outline is unreadable against an arbitrary hero image, so the
 * secondary controls drop the brand colour and borrow the picture instead; only
 * the primary call to action keeps `--primary`, where the filled surface carries
 * its own contrast.
 */
const OVERLAY_CONTROL =
  'border-white/40 bg-white/12 text-white backdrop-blur-sm hover:bg-white/25 hover:text-white';

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
  const overlay = useOverlayHeader();

  return (
    <header
      className={cn(
        'z-40 font-studio',
        overlay
          ? // Out of flow, so the page's artwork starts at the top of the document
            // and the bar sits *on* it. It scrolls away with the hero rather than
            // pinning: a transparent bar stuck at the top would drag the hero's
            // white ink over whatever section scrolled underneath it.
            'absolute inset-x-0 top-0 text-white'
          : 'sticky top-0 bg-background text-foreground shadow-sm',
      )}
    >
      <div className="mx-auto w-full max-w-292.5 px-4 sm:px-6 xl:px-0">
        <div className="hidden h-18 items-center justify-between lg:flex">
          <BrandHomeLink locale={locale} tenant={tenant} overlay={overlay} />

          <nav aria-label={t('mainNavigation')} className="flex items-center gap-4">
            <Button
              asChild
              variant="outline"
              className={cn(NAV_BUTTON, overlay ? OVERLAY_CONTROL : 'border-foreground')}
            >
              <Link to={storefrontPaths.bookings(locale)} prefetch="intent">
                <Search aria-hidden="true" className="size-4" />
                {t('lookup')}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className={cn(
                NAV_BUTTON,
                overlay
                  ? OVERLAY_CONTROL
                  : 'border-primary text-primary hover:bg-primary/10 hover:text-primary',
              )}
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
                  className={cn(
                    NAV_BUTTON,
                    overlay
                      ? 'text-white hover:bg-white/15 hover:text-white'
                      : 'text-primary hover:bg-primary/10 hover:text-primary',
                  )}
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
          brand={<BrandHomeLink locale={locale} tenant={tenant} overlay={overlay} />}
          actions={
            currentUser ? (
              <SiteHeaderAccountMenu
                currentUser={currentUser}
                locale={locale}
                accountMenuSummary={accountMenuSummary}
              />
            ) : (
              // The phone header has room for exactly one worded control, and it
              // is the one that grows the tenant's account list — signing in
              // stays a step inside the sheet.
              <Button asChild className="h-9.5 rounded-md px-4 text-xs font-bold">
                <Link to={storefrontPaths.register(locale)} prefetch="intent">
                  {t('register')}
                </Link>
              </Button>
            )
          }
          listingTypes={listingTypes}
          locale={locale}
          currentUser={currentUser}
          overlay={overlay}
          redirectTo={redirectTo}
        />
      </div>
    </header>
  );
}

function BrandHomeLink({
  locale,
  tenant,
  overlay,
}: {
  locale: Locale;
  tenant: StorefrontTenant;
  overlay: boolean;
}) {
  const { t } = useTranslation([NsI18n.Navigation]);
  return (
    <Link
      to={storefrontPaths.home(locale)}
      prefetch="intent"
      aria-label={t('brandHome', { tenant: tenant.name })}
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
