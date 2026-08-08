import { BookingI18nProvider } from '@booking/i18n';
import { Outlet } from 'react-router';
import { PlatformLanding } from '~/features/platform-landing/components/platform-landing';
import { useServiceWorker } from '~/features/pwa/hooks/use-service-worker';
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
  useServiceWorker();

  return (
    <BookingI18nProvider locale={loaderData.locale}>
      {loaderData.kind === 'platform' ? (
        <PlatformLanding loaderData={loaderData} />
      ) : (
        <TenantStorefrontAppShell loaderData={loaderData} />
      )}
    </BookingI18nProvider>
  );
}

function TenantStorefrontAppShell({ loaderData }: { loaderData: TenantRootLoaderPayload }) {
  const {
    accountMenuSummary,
    bypassTenantGate,
    currentUser,
    documentNonce,
    hideBottomNav,
    hideMobileMenuTrigger,
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
            listingTypes={listingTypes}
            locale={locale}
            currentUser={currentUser}
            accountMenuSummary={accountMenuSummary}
            hideBelowMd={Boolean(mobileChrome)}
            hideMobileMenuTrigger={hideMobileMenuTrigger}
          />
          <main className="flex-1">
            <Outlet context={outletContext} />
          </main>
          <SiteFooter tenant={tenant} hideBelowMd={Boolean(mobileChrome)} />
          {showBottomNav ? (
            <>
              <div
                aria-hidden="true"
                className="h-[calc(3.5rem+env(safe-area-inset-bottom))] shrink-0 lg:hidden"
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
