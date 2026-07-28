import { CircleCheck } from 'lucide-react';
import { useLoaderData } from 'react-router';
import { loadPartnerDoneRoute } from '~/features/partner-onboarding/server/partner-done-route.server';
import { NsI18n, useTranslation } from '~/lib/i18n';
import type { Route } from './+types/done';
import { partnerMeta } from '~/features/partner-onboarding/lib/partner-onboarding-meta';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  const rootData = matches[0].loaderData;
  return partnerMeta(
    rootData.kind === 'tenant' ? rootData.tenant.name : undefined,
    params.locale,
    'done',
  );
}

export const loader = ({ request, params }: Route.LoaderArgs) =>
  loadPartnerDoneRoute(request, params.locale);

export default function PartnerDone() {
  const { maskedEmail, dashboardUrl } = useLoaderData<typeof loader>();
  const { t } = useTranslation([NsI18n.Auth, NsI18n.Common]);
  return (
    <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-10 sm:px-6 sm:pt-16">
      <section className="w-full max-w-[570px] bg-card p-8 text-center text-card-foreground shadow-sm sm:p-10">
        <span
          className="mx-auto grid size-26 place-items-center rounded-full bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <CircleCheck className="size-14" strokeWidth={1.75} />
        </span>
        <h1 className="mt-10 text-2xl font-semibold uppercase leading-9">
          {t('auth:partner.doneTitle')}
        </h1>
        <p className="mx-auto mt-5 max-w-[490px] text-sm font-medium leading-7 text-muted-foreground">
          {t('auth:partner.doneBody')}{' '}
          <strong className="font-semibold text-foreground">{maskedEmail}</strong>
        </p>
        <a
          href={`${dashboardUrl}/auth/login`}
          className="mt-10 flex h-11 w-full items-center justify-center rounded-sm bg-primary text-base font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('common:becomePartner.goToDashboard')}
        </a>
      </section>
    </main>
  );
}
