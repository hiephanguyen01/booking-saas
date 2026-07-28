import { cn } from '@booking/ui/lib/utils';
import type { ReactNode } from 'react';
import { NsI18n, useTranslation } from '~/lib/i18n';

export function PromoPanel({ tenantName }: { tenantName: string }) {
  const { t } = useTranslation([NsI18n.Auth, NsI18n.Common]);
  return (
    <section className="flex w-full max-w-[486px] flex-col">
      {/* Not a heading: the step's own <h1> is the page title, and this panel is
          hidden below `lg`, which would leave small screens without one. */}
      <p className="text-[34px] font-semibold leading-[1.55] tracking-[-0.025em] text-foreground sm:text-[40px] sm:leading-[1.4]">
        {t('auth:partner.promoTitle')}
      </p>
      <p className="mt-3 max-w-[448px] text-sm font-medium leading-6 text-muted-foreground">
        {t('common:becomePartner.subtitle', { tenant: tenantName })}
      </p>
    </section>
  );
}

export function AuthSplit({
  children,
  tenantName,
  tall = false,
}: {
  children: ReactNode;
  tenantName: string;
  tall?: boolean;
}) {
  return (
    <main className="mx-auto grid w-full max-w-292.5 grid-cols-1 gap-10 px-5 pb-16 lg:grid-cols-[486px_566px] lg:justify-between lg:px-0 lg:pt-10">
      <div className="hidden lg:block">
        <PromoPanel tenantName={tenantName} />
      </div>
      <section
        className={cn(
          'w-full self-center bg-card px-6 py-10 text-card-foreground shadow-sm sm:px-10',
          tall && 'min-h-[548px]',
        )}
      >
        {children}
      </section>
    </main>
  );
}

export function FormHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-10">
      <h1 className="text-2xl font-semibold leading-9 text-foreground">{title}</h1>
      {description ? (
        <div className="mt-6 text-base font-medium leading-6 text-muted-foreground">
          {description}
        </div>
      ) : null}
    </div>
  );
}
