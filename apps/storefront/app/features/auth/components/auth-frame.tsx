import type { ReactNode } from 'react';
import type { StorefrontTenant } from '~/lib/server/tenant.server';
import { NsI18n, useTranslation } from '@booking/i18n';

export function AuthFrame({
  tenant,
  title,
  description,
  split = false,
  children,
}: {
  tenant: StorefrontTenant;
  title: string;
  description: string;
  split?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation(NsI18n.Auth);

  return (
    <section className="mx-auto flex w-full max-w-292.5 items-stretch overflow-hidden rounded-sm border bg-card shadow-lg">
      {split ? (
        <aside className="relative hidden min-h-157.5 w-1/2 max-w-[585px] overflow-hidden bg-primary/10 p-10 lg:flex lg:flex-col lg:justify-end">
          {tenant.themeConfig.hero?.imageUrl ? (
            <img
              src={tenant.themeConfig.hero.imageUrl}
              alt=""
              width={1170}
              height={1260}
              className="absolute inset-0 size-full object-cover opacity-45"
            />
          ) : null}
          <div className="absolute inset-0 bg-linear-to-t from-primary/45 via-primary/12 to-background/20" />
          <div className="relative max-w-md rounded-sm border border-white/40 bg-background/90 p-6 backdrop-blur-sm">
            {tenant.themeConfig.logoUrl ? (
              <img
                src={tenant.themeConfig.logoUrl}
                alt={tenant.name}
                width={150}
                height={48}
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
        className={
          split
            ? 'flex min-h-157.5 flex-1 items-center px-6 py-10 sm:px-12 lg:px-14'
            : 'w-full px-6 py-12 sm:px-12'
        }
      >
        <div className="mx-auto w-full max-w-122">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
