import { affiliateRegistrationSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router';
import { useAffiliateApplicationPageController } from '~/features/affiliate/hooks/use-affiliate-application-page-controller';
import type {
  loadAffiliateApplicationRoute,
  submitAffiliateApplication,
} from '~/features/affiliate/server/affiliate-application-route.server';
import { LegalDocumentLinks } from '~/features/legal/components/legal-document-links';
import type { ServerDataFrom } from '~/lib/react-router-data';

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

export interface AffiliateApplicationPageProps {
  loaderData: ServerDataFrom<typeof loadAffiliateApplicationRoute>;
  actionData?: ServerDataFrom<typeof submitAffiliateApplication>;
}

export function AffiliateApplicationPage({
  loaderData,
  actionData,
}: AffiliateApplicationPageProps) {
  const {
    dashboardLoginHref,
    defaultValues,
    fieldErrors,
    formFields,
    legalDocuments,
    locale,
    logoUrl,
    serverError,
    success,
    t,
    tenantName,
    transform,
  } = useAffiliateApplicationPageController({ loaderData, actionData });

  if (success) {
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
              href={dashboardLoginHref}
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
              defaultValues={defaultValues}
              transform={transform}
              columns={2}
              submitLabel={t('auth:affiliate.submit')}
              submitFullWidth
              serverError={serverError}
              fieldErrors={fieldErrors}
              extraFields={() =>
                legalDocuments.length ? (
                  <LegalDocumentLinks
                    documents={legalDocuments}
                    locale={locale}
                    className="-mt-2 text-muted-foreground"
                  />
                ) : null
              }
            />
          </div>
        </div>
      </main>
    </div>
  );
}
