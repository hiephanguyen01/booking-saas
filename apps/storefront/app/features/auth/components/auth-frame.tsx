import type { ReactNode } from 'react';
import { Image } from '@booking/ui/components/media/image';
import { Button } from '@booking/ui/components/ui/button';
import type { StorefrontTenant } from '~/lib/server/tenant.server';
import { NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';
import { PANEL_SURFACE } from '~/constants/surfaces';
import { ChevronLeft, Home } from 'lucide-react';
import { Link } from 'react-router';
import { TenantBrand } from '~/features/site-shell/components/tenant-brand';
import { storefrontPaths } from '~/constants/paths';
import { useLocale } from '~/hooks/use-locale';

export function AuthFrame({
  tenant,
  title,
  description,
  split = false,
  backTo,
  hideHeadingBelowMd = false,
  children,
}: {
  tenant: StorefrontTenant;
  title: string;
  description: string;
  split?: boolean;
  backTo?: string;
  hideHeadingBelowMd?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation([NsI18n.Auth, NsI18n.Navigation]);
  const locale = useLocale();
  const homeTo = storefrontPaths.home(locale);

  return (
    <section
      className={cn(
        PANEL_SURFACE,
        'relative mx-auto flex w-full max-w-292.5 flex-col items-stretch overflow-visible bg-transparent max-md:rounded-none max-md:[border-width:0] max-md:shadow-none md:flex-row md:overflow-hidden md:rounded-sm md:border md:border-border md:bg-card md:shadow-lg',
      )}
    >
      <div className="relative h-37 w-full shrink-0 overflow-hidden bg-primary/10 md:hidden">
        {tenant.themeConfig.hero?.imageUrl ? (
          <Image
            src={tenant.themeConfig.hero.imageUrl}
            alt=""
            width={786}
            height={296}
            priority
            className="absolute inset-0 size-full object-cover opacity-20"
          />
        ) : null}
        <div className="absolute inset-0 bg-primary/10" />
        <div className="relative flex h-full items-center justify-between gap-4 px-5 pb-4 pt-5">
          <Link
            to={homeTo}
            prefetch="intent"
            aria-label={t('navigation:brandHome', { tenant: tenant.name })}
            className="min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <TenantBrand
              name={tenant.name}
              logoUrl={tenant.themeConfig.logoUrl || null}
              width={180}
              height={56}
              imageClassName="h-11 w-auto max-w-48 object-contain"
              textClassName="block max-w-64 truncate text-xl font-bold tracking-tight text-primary"
            />
          </Link>
          <Button
            asChild
            variant="ghost"
            size="icon-lg"
            className="size-11 rounded-(--sf-surface-radius) bg-background/75 text-foreground shadow-sm backdrop-blur-sm hover:bg-background/90 hover:text-foreground"
          >
            <Link to={homeTo} prefetch="intent" aria-label={t('navigation:bottomNav.home')}>
              <Home aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
      {split ? (
        <aside className="relative hidden min-h-157.5 w-1/2 max-w-[585px] overflow-hidden bg-primary/10 p-10 lg:flex lg:flex-col lg:justify-end">
          {tenant.themeConfig.hero?.imageUrl ? (
            <Image
              src={tenant.themeConfig.hero.imageUrl}
              alt=""
              width={1170}
              height={1260}
              priority
              className="absolute inset-0 size-full object-cover opacity-45"
            />
          ) : null}
          <div className="absolute inset-0 bg-linear-to-t from-primary/45 via-primary/12 to-background/20" />
          <div className="relative max-w-md rounded-sm border border-foreground/25 bg-background/90 p-6 backdrop-blur-sm">
            {tenant.themeConfig.logoUrl ? (
              <Image
                src={tenant.themeConfig.logoUrl}
                alt={tenant.name}
                width={150}
                height={48}
                loading="eager"
                className="mb-5 h-10 w-auto object-contain"
              />
            ) : (
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-primary">
                {tenant.name}
              </p>
            )}
            <p className="text-xl font-semibold tracking-tight">{t('promo.title')}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('promo.description')}</p>
          </div>
        </aside>
      ) : null}
      <div
        className={cn(
          PANEL_SURFACE,
          'relative -mt-5 w-full bg-card px-5 pb-10 pt-6 max-md:rounded-b-none md:mt-0 md:rounded-none md:[border-width:0] md:bg-transparent md:shadow-none',
          split
            ? 'md:flex md:min-h-157.5 md:flex-1 md:items-center md:px-12 md:py-10 lg:px-14'
            : 'md:w-full md:px-12 md:py-12',
        )}
      >
        <div className="mx-auto w-full max-w-122">
          <div
            className={cn(
              'mb-6 flex items-start gap-2.5 text-left md:mb-8 md:block md:text-center',
              hideHeadingBelowMd && 'max-md:hidden',
            )}
          >
            {backTo ? (
              <Button
                asChild
                variant="ghost"
                size="icon-lg"
                className="-ml-2 -mt-1 bg-muted/70 md:hidden"
              >
                <Link to={backTo} aria-label={t('header.back')}>
                  <ChevronLeft aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground md:mt-3">{description}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
