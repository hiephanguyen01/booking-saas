import type { Locale } from '@booking/i18n';
import { BookingI18nProvider } from '@booking/i18n';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { Image } from '@booking/ui/components/media/image';
import { Button } from '@booking/ui/components/ui/button';
import { isRouteErrorResponse, Link } from 'react-router';
import { TenantBrand } from '~/features/site-shell/components/tenant-brand';
import { NsI18n, useTranslation } from '@booking/i18n';
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

  if (isUnknownHostError(error)) {
    return (
      <main className="flex min-h-dvh justify-center bg-muted/40 px-4 py-12 font-studio text-foreground">
        <section className="flex w-full max-w-125 flex-col items-center justify-center text-center">
          <NotFoundIllustration />
          <p className="text-sm font-medium text-muted-foreground">404</p>
          <h1 className="mt-2 text-[28px] leading-10 font-semibold sm:text-[32px] sm:leading-12">
            {t('unknownHostTitle')}
          </h1>
          <p className="mt-3 max-w-105 text-sm leading-6 text-muted-foreground sm:text-base">
            {t('unknownHostDescription')}
          </p>
        </section>
      </main>
    );
  }

  if (isNotFoundError(error)) {
    return (
      <div className="flex min-h-dvh flex-col bg-muted/40 font-studio text-foreground">
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
              <NotFoundIllustration />
              <h1 className="w-full text-[28px] leading-10 font-semibold sm:text-[32px] sm:leading-12">
                {t('pageNotFound')}
              </h1>
            </div>

            <Button
              asChild
              className="h-12 rounded-sm bg-foreground px-5 text-base font-semibold text-background shadow-xs hover:bg-foreground/90"
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

function NotFoundIllustration() {
  return (
    <Image
      src="/studiohub/404-illustration.png"
      alt=""
      width={500}
      height={500}
      loading="eager"
      className="aspect-square w-full object-contain"
    />
  );
}

function routeErrorData(error: unknown, status: number): Record<string, unknown> | null {
  if (!isRouteErrorResponse(error) || error.status !== status) return null;
  return error.data && typeof error.data === 'object'
    ? (error.data as Record<string, unknown>)
    : null;
}

function tenantUnavailableErrorData(error: unknown): TenantUnavailableErrorData | null {
  const candidate = routeErrorData(error, 423);
  if (!candidate) return null;
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

function isUnknownHostError(error: unknown): boolean {
  return routeErrorData(error, 404)?.code === 'UNKNOWN_HOST';
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: unknown }).status === 404,
  );
}
