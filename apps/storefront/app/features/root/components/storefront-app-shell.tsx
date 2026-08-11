import { BookingI18nProvider } from '@booking/i18n';
import { Outlet } from 'react-router';
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
  const pwaTenant =
    loaderData.kind === 'tenant' && loaderData.tenant.live
      ? { name: loaderData.tenant.name, themeConfig: loaderData.tenant.themeConfig }
      : null;

  return (
    <BookingI18nProvider locale={loaderData.locale}>
      <PwaProvider tenant={pwaTenant}>
        {loaderData.kind === 'platform' ? (
          <PlatformLanding loaderData={loaderData} />
        ) : (
          <TenantStorefrontAppShell loaderData={loaderData} />
        )}
      </PwaProvider>
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
