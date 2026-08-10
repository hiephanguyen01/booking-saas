import type { AcceptanceRecord, LegalDocumentType } from '@booking/contracts';
import type { Locale, ScopedI18n } from '@booking/i18n';
import { formatDate, NsI18n, useTranslation } from '@booking/i18n';
import { FileText, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import {
  AccountListState,
  AccountPanel,
} from '~/features/account/components/shared/account-primitives';
import type { loadAccountTermsRoute } from '~/features/account/server/account-terms-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';
import { DEFAULT_TZ } from '~/lib/time';

const DOCUMENT_AGREEMENT_TYPES = new Set<string>([
  'customer_terms',
  'privacy_policy',
  'partner_terms',
  'affiliate_terms',
]);

function isDocumentBacked(agreementType: string): agreementType is LegalDocumentType {
  return DOCUMENT_AGREEMENT_TYPES.has(agreementType);
}

/** `commission_schedule`/`promo_funding` have no public document page but still need a label here. */
function agreementTypeLabel(
  agreementType: AcceptanceRecord['agreementType'],
  t: ScopedI18n<[NsI18n.Legal]>['t'],
): string {
  return isDocumentBacked(agreementType)
    ? t(`documentLabels.${agreementType}`)
    : t(`otherAgreementLabels.${agreementType}`);
}

/** `/account/terms` — "the terms I accepted": every acceptance row this user has, newest first. */
export function MyAcceptancesPage({
  loaderData,
}: {
  loaderData: ServerDataFrom<typeof loadAccountTermsRoute>;
}) {
  const { acceptances, loadFailed, locale } = loaderData;
  const { t } = useTranslation(NsI18n.Legal);

  return (
    <div className="flex flex-col gap-(--sf-section-gap) py-2 font-studio md:gap-4">
      <div>
        <h1 className="text-base font-semibold leading-6 text-foreground">
          {t('myAcceptancesTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('myAcceptancesSubtitle')}</p>
      </div>

      {loadFailed ? (
        <AccountListState
          icon={ShieldAlert}
          tone="destructive"
          message={t('myAcceptancesLoadError')}
        />
      ) : acceptances.length === 0 ? (
        <AccountListState icon={FileText} message={t('myAcceptancesEmpty')} />
      ) : (
        <AccountPanel className="divide-y divide-border">
          {acceptances.map((acceptance) => (
            <AcceptanceRow
              key={`${acceptance.agreementType}-${acceptance.documentVersionId ?? acceptance.version}-${acceptance.acceptedAt}`}
              acceptance={acceptance}
              locale={locale}
            />
          ))}
        </AccountPanel>
      )}
    </div>
  );
}

function AcceptanceRow({ acceptance, locale }: { acceptance: AcceptanceRecord; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Legal);
  const documentBacked = isDocumentBacked(acceptance.agreementType);
  const versionNo = Number(acceptance.version);
  const canRead =
    documentBacked && acceptance.documentVersionId !== null && Number.isInteger(versionNo);
  const languageLabel =
    acceptance.acceptedLocale === 'vi'
      ? t('languageVi')
      : acceptance.acceptedLocale === 'en'
        ? t('languageEn')
        : t('languageUnknown');

  return (
    <div className="flex flex-col gap-3 p-(--sf-surface-pad) sm:flex-row sm:items-center sm:justify-between md:px-5 md:py-4">
      <div>
        <p className="text-sm font-semibold text-foreground">
          {agreementTypeLabel(acceptance.agreementType, t)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {Number.isNaN(versionNo) ? acceptance.version : t('versionLabel', { versionNo })}
          {' · '}
          {/* Explicit zone: this loader never resolves a live tenant (see
              account-terms-route.server.ts), and without one Intl falls back to the runtime's
              local zone, which differs between SSR and the browser and causes a hydration
              mismatch. */}
          {formatDate(acceptance.acceptedAt, locale, DEFAULT_TZ)}
          {' · '}
          {languageLabel}
        </p>
      </div>
      {canRead ? (
        <Link
          to={storefrontPaths.legalVersion(
            locale,
            acceptance.agreementType as LegalDocumentType,
            versionNo,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-sm font-medium text-primary underline underline-offset-2"
        >
          {t('viewText')}
        </Link>
      ) : null}
    </div>
  );
}
