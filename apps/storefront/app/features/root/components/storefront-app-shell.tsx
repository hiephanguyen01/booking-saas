import { BookingI18nProvider } from '@booking/i18n';
import { Outlet } from 'react-router';
import { SiteFooter } from '../../../layouts/site-footer';
import { SiteHeader } from '../../../layouts/site-header';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import type { RootLoaderPayload } from '../server/root-loader.server';
import { TenantThemeStyle } from './tenant-theme-style';
import { useStorefrontAppShellController } from './use-storefront-app-shell-controller';

export function StorefrontAppShell({ loaderData }: { loaderData: RootLoaderPayload }) {
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
    <BookingI18nProvider locale={locale}>
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
    </BookingI18nProvider>
  );
}

function SuspendedNotice({ name }: { name: string }) {
  const { t } = useTranslation(NsI18n.Error);
  return (
    <main className="mx-auto flex flex-1 max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t('tenantSuspendedTitle', { tenant: name })}</h1>
      <p className="text-muted-foreground">{t('tenantSuspendedDescription')}</p>
    </main>
  );
}
