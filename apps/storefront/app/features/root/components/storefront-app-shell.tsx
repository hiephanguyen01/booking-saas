import { BookingI18nProvider } from '@booking/i18n';
import { Outlet } from 'react-router';
import { PlatformLanding } from '~/features/platform-landing/components/platform-landing';
import { SiteFooter } from '~/layouts/site-footer';
import { SiteHeader } from '~/layouts/site-header';
import type {
  RootLoaderPayload,
  TenantRootLoaderPayload,
} from '~/features/root/server/root-loader.server';
import { SuspendedNotice } from './suspended-notice';
import { TenantThemeStyle } from './tenant-theme-style';
import { useStorefrontAppShellController } from './use-storefront-app-shell-controller';

export function StorefrontAppShell({ loaderData }: { loaderData: RootLoaderPayload }) {
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
    currentUser,
    documentNonce,
    isStandalone,
    listingTypes,
    locale,
    outletContext,
    tenant,
  } = useStorefrontAppShellController(loaderData);

  return (
    <div className="flex min-h-dvh flex-col bg-(--sf-background) text-foreground">
      <TenantThemeStyle theme={tenant.themeConfig} nonce={documentNonce} />
      {!tenant.live ? (
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
          />
          <main className="flex-1">
            <Outlet context={outletContext} />
          </main>
          <SiteFooter tenant={tenant} />
        </>
      )}
    </div>
  );
}
