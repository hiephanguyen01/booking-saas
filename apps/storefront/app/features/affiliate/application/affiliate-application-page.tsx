import { affiliateRegistrationSchema, type AffiliateRegistrationInput } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useRouteLoaderData } from 'react-router';
import { NsI18n, useTranslation, type ScopedI18n, type ScopedTranslationKey } from '../../../lib/i18n';
import type { loader as rootLoader } from '../../../root';
import type { Route } from '../../../routes/+types/become-affiliate';

const APPLY_ERRORS = {
  emailTakenWrongPassword: 'common:becomePartner.errors.emailTakenWrongPassword',
  TENANT_INACTIVE: 'auth:affiliate.errors.tenantInactive',
} as const satisfies Record<string, ScopedTranslationKey<[NsI18n.Auth, NsI18n.Common]>>;

function fields(
  t: ScopedI18n<[NsI18n.Auth, NsI18n.Common]>['t'],
): FieldConfig<AffiliateRegistrationInput>[] {
  return [
    {
      name: 'fullName',
      type: 'text',
      label: t('common:becomePartner.fullName'),
      autoComplete: 'name',
      colSpan: 2,
    },
    { name: 'email', type: 'email', label: t('common:becomePartner.email'), autoComplete: 'email' },
    { name: 'phone', type: 'text', label: t('common:becomePartner.phone'), autoComplete: 'tel' },
    {
      name: 'password',
      type: 'password',
      label: t('common:becomePartner.password'),
      autoComplete: 'new-password',
      colSpan: 2,
    },
    { name: 'bankName', type: 'text', label: t('auth:affiliate.bankOptional') },
    { name: 'accountNo', type: 'text', label: t('auth:affiliate.accountNoOptional') },
    {
      name: 'accountHolder',
      type: 'text',
      label: t('auth:affiliate.accountHolderOptional'),
      colSpan: 2,
    },
  ];
}

function BrandHeader({ logoUrl, tenantName }: { logoUrl: string | null; tenantName: string }) {
  return (
    <header className="flex h-18 items-center border-b border-border px-6 lg:px-10">
      <Link
        to="/"
        className="flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {logoUrl ? (
          <img src={logoUrl} alt={tenantName} className="h-9 w-auto max-w-40 object-contain" />
        ) : (
          <span className="text-lg font-semibold text-foreground">{tenantName}</span>
        )}
      </Link>
    </header>
  );
}

export function AffiliateApplicationPage({ loaderData, actionData }: Route.ComponentProps) {
  const { tenantName, dashboardUrl } = loaderData;
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  const logoUrl = loaderData.tenantLogoUrl ?? rootData?.tenant?.themeConfig.logoUrl ?? null;
  const { t } = useTranslation([NsI18n.Auth, NsI18n.Common]);
  const formFields = useMemo(() => fields(t), [t]);

  const errorCode = actionData?.error;
  const serverError = errorCode
    ? t(
        APPLY_ERRORS[errorCode as keyof typeof APPLY_ERRORS] ??
          'common:becomePartner.errors.generic',
      )
    : null;

  if (actionData?.ok) {
    return (
      <div className="min-h-dvh bg-background">
        <BrandHeader logoUrl={logoUrl} tenantName={tenantName} />
        <main className="flex min-h-[calc(100dvh-4.5rem)] items-center justify-center px-6 py-20">
          <div className="w-full max-w-[570px] rounded-2xl border border-border bg-card p-10 text-center text-card-foreground shadow-sm">
            <div
              className="mx-auto mb-6 flex size-26 items-center justify-center rounded-full bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <CheckCircle2 className="size-12" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('auth:affiliate.successTitle')}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {t('auth:affiliate.successBody', { tenant: tenantName })}
            </p>
            <a
              href={`${dashboardUrl}/auth/login`}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              {t('common:becomePartner.goToDashboard')}
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <BrandHeader logoUrl={logoUrl} tenantName={tenantName} />
      <main className="mx-auto max-w-[640px] px-6 py-10 lg:px-10">
        <div className="rounded-2xl border border-border bg-card p-8 text-card-foreground shadow-sm lg:p-10">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t('auth:affiliate.title')}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t('auth:affiliate.subtitle', { tenant: tenantName })}
          </p>

          <div className="mt-8">
            <GenericForm
              schema={affiliateRegistrationSchema}
              fields={formFields}
              columns={2}
              submitLabel={t('auth:affiliate.submit')}
              submitFullWidth
              serverError={serverError}
              fieldErrors={actionData?.fieldErrors ?? null}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
