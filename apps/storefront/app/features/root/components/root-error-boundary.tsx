import type { Locale } from '@booking/i18n';
import { BookingI18nProvider } from '@booking/i18n';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { Button } from '@booking/ui/components/ui/button';
import { isRouteErrorResponse, Link } from 'react-router';
import { TenantBrand } from '~/features/site-shell/components/tenant-brand';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { storefrontPaths } from '~/constants/paths';
import type { RootLoaderPayload } from '~/features/root/server/root-loader.server';
import { SuspendedNotice } from './suspended-notice';
import { TenantThemeStyle } from './tenant-theme-style';

interface TenantUnavailableErrorData {
  code: 'TENANT_UNAVAILABLE';
  tenantName: string;
  locale: Locale;
}

export function RootErrorBoundaryView({
  error,
  locale,
  rootData,
}: {
  error: unknown;
  locale: Locale;
  rootData: RootLoaderPayload | undefined;
}) {
  const tenantUnavailable = tenantUnavailableErrorData(error);
  const effectiveLocale = tenantUnavailable?.locale ?? locale;

  return (
    <BookingI18nProvider locale={effectiveLocale}>
      <RootErrorNotice
        error={error}
        locale={effectiveLocale}
        rootData={rootData}
        tenantUnavailable={tenantUnavailable}
      />
    </BookingI18nProvider>
  );
}

function RootErrorNotice({
  error,
  locale,
  rootData,
  tenantUnavailable,
}: {
  error: unknown;
  locale: Locale;
  rootData: RootLoaderPayload | undefined;
  tenantUnavailable: TenantUnavailableErrorData | null;
}) {
  const { t } = useTranslation(NsI18n.Error);

  if (tenantUnavailable) {
    return <SuspendedNotice name={tenantUnavailable.tenantName} />;
  }

  if (isNotFoundError(error)) {
    return (
      <div className="flex min-h-dvh flex-col bg-[#f9fafb] font-studio text-[#344054]">
        {rootData?.kind === 'tenant' ? (
          <>
            <TenantThemeStyle theme={rootData.tenant.themeConfig} nonce={rootData.cspNonce} />
            <header className="h-18 shrink-0">
              <div className="mx-auto flex h-full w-full max-w-292.5 items-center px-4 sm:px-6 xl:px-0">
                <Link
                  to={storefrontPaths.home(locale)}
                  aria-label={rootData.tenant.name}
                  className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TenantBrand
                    name={rootData.tenant.name}
                    logoUrl={rootData.tenant.themeConfig.logoUrl || null}
                    width={133}
                    height={40}
                  />
                </Link>
              </div>
            </header>
          </>
        ) : null}

        <main className="flex flex-1 justify-center px-4 pb-12 pt-8 sm:px-6 lg:pt-22">
          <section className="flex w-full max-w-125 flex-col items-center gap-6 text-center">
            <div className="flex w-full flex-col items-center">
              <img
                src="/booking-studio/404-illustration.png"
                alt=""
                width={500}
                height={500}
                className="aspect-square w-full object-contain"
              />
              <h1 className="w-full text-[28px] leading-10 font-semibold sm:text-[32px] sm:leading-12">
                {t('pageNotFound')}
              </h1>
            </div>

            <Button
              asChild
              className="h-12 rounded-sm bg-[#475467] px-5 text-base font-semibold text-white shadow-xs hover:bg-[#344054]"
            >
              <Link to={storefrontPaths.home(locale)}>{t('home')}</Link>
            </Button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-background text-foreground">
      <RouteErrorState
        error={error}
        homeHref={storefrontPaths.home(locale)}
        homeLabel={t('home')}
      />
    </main>
  );
}

function tenantUnavailableErrorData(error: unknown): TenantUnavailableErrorData | null {
  if (!isRouteErrorResponse(error) || error.status !== 423) return null;
  if (!error.data || typeof error.data !== 'object') return null;

  const candidate = error.data as {
    code?: unknown;
    tenantName?: unknown;
    locale?: unknown;
  };
  if (
    candidate.code !== 'TENANT_UNAVAILABLE' ||
    typeof candidate.tenantName !== 'string' ||
    (candidate.locale !== 'vi' && candidate.locale !== 'en')
  ) {
    return null;
  }

  return {
    code: candidate.code,
    tenantName: candidate.tenantName,
    locale: candidate.locale,
  };
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: unknown }).status === 404,
  );
}
