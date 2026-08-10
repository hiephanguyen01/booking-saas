import { BookingI18nProvider } from '@booking/i18n';
import { Outlet, useLocation } from 'react-router';
import { PlatformLanding } from '~/features/platform-landing/components/platform-landing';
import { PwaProvider } from '~/features/pwa/components/pwa-provider';
import { useStorefrontAppShellController } from '~/features/root/hooks/use-storefront-app-shell-controller';
import type {
  RootLoaderPayload,
  TenantRootLoaderPayload,
} from '~/features/root/server/root-loader.server';
import { SiteBottomNav } from '~/features/site-shell/components/site-bottom-nav';
import { SiteFooter } from '~/features/site-shell/components/site-footer';
import { SiteHeader } from '~/features/site-shell/components/site-header';
import { SuspendedNotice } from './suspended-notice';
import { TenantThemeStyle } from './tenant-theme-style';

export function StorefrontAppShell({ loaderData }: { loaderData: RootLoaderPayload }) {
  const { pathname } = useLocation();
  const tenantIcons =
    loaderData.kind === 'tenant' ? loaderData.tenant.themeConfig.pwaIcons : undefined;
  const advertiseInstall =
    loaderData.kind === 'tenant' &&
    loaderData.tenant.live &&
    Boolean(tenantIcons?.icon180Url && tenantIcons.icon192Url && tenantIcons.icon512Url) &&
    isPublicInstallPromotionPath(pathname, loaderData.locale);

  return (
    <BookingI18nProvider locale={loaderData.locale}>
      <PwaProvider
        advertiseInstall={advertiseInstall}
        installAppName={loaderData.kind === 'tenant' ? loaderData.tenant.name : undefined}
      >
        {loaderData.kind === 'platform' ? (
          <PlatformLanding loaderData={loaderData} />
        ) : (
          <TenantStorefrontAppShell loaderData={loaderData} />
        )}
      </PwaProvider>
    </BookingI18nProvider>
  );
}

function isPublicInstallPromotionPath(
  pathname: string,
  locale: RootLoaderPayload['locale'],
): boolean {
  const localeRoot = `/${locale}`;
  if (pathname === localeRoot || pathname === `${localeRoot}/`) return true;
  if (!pathname.startsWith(`${localeRoot}/`)) return false;

  const segments = pathname
    .slice(localeRoot.length + 1)
    .split('/')
    .filter(Boolean);
  if (segments.length === 1) return segments[0] === 'nearby' || segments[0] === 'community';
  if (segments.length !== 2) return false;
  return segments[0] === 't' || segments[0] === 'l' || segments[0] === 'g' || segments[0] === 'p';
}

function TenantStorefrontAppShell({ loaderData }: { loaderData: TenantRootLoaderPayload }) {
  const {
    accountMenuSummary,
    bypassTenantGate,
    currentUser,
    documentNonce,
    hideBottomNav,
    isStandalone,
    listingTypes,
    locale,
    mobileChrome,
    outletContext,
    tenant,
  } = useStorefrontAppShellController(loaderData);
  const showBottomNav = !hideBottomNav;

  return (
    // `relative`: the header takes itself out of flow on pages that float it over
    // their own hero, and it anchors to this box rather than to the document.
    <div className="relative flex min-h-dvh flex-col bg-background text-foreground">
      <TenantThemeStyle theme={tenant.themeConfig} nonce={documentNonce} />
      {!tenant.live && !bypassTenantGate ? (
        <SuspendedNotice name={tenant.name} />
      ) : isStandalone ? (
        <Outlet context={outletContext} />
      ) : (
        <>
          <SiteHeader
            tenant={tenant}
            locale={locale}
            currentUser={currentUser}
            accountMenuSummary={accountMenuSummary}
            hideBelowMd={Boolean(mobileChrome)}
          />
          <main className="flex-1">
            <Outlet context={outletContext} />
          </main>
          <SiteFooter tenant={tenant} hideBelowMd={Boolean(mobileChrome)} />
          {showBottomNav ? (
            <>
              <div
                aria-hidden="true"
                className="h-[calc(3.5rem+env(safe-area-inset-bottom))] shrink-0 md:hidden"
              />
              <SiteBottomNav
                listingTypes={listingTypes}
                locale={locale}
                signedIn={Boolean(currentUser)}
              />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
