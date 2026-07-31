import type { AcceptanceRecord, LegalDocumentType } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { formatDate } from '@booking/i18n';
import { FileText, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import {
  AccountListState,
  AccountPanel,
} from '~/features/account/components/shared/account-primitives';
import type { loadAccountTermsRoute } from '~/features/account/server/account-terms-route.server';
import { agreementTypeLabel, LEGAL_COPY } from '~/features/legal/lib/legal-copy';
import type { ServerDataFrom } from '~/lib/react-router-data';

const DOCUMENT_AGREEMENT_TYPES = new Set<string>([
  'customer_terms',
  'privacy_policy',
  'partner_terms',
  'affiliate_terms',
]);

function isDocumentBacked(agreementType: string): agreementType is LegalDocumentType {
  return DOCUMENT_AGREEMENT_TYPES.has(agreementType);
}

/** `/account/terms` — "the terms I accepted": every acceptance row this user has, newest first. */
export function MyAcceptancesPage({
  loaderData,
}: {
  loaderData: ServerDataFrom<typeof loadAccountTermsRoute>;
}) {
  const { acceptances, loadFailed, locale } = loaderData;
  const copy = LEGAL_COPY[locale];

  return (
    <div className="flex flex-col gap-4 py-2 font-studio">
      <div>
        <h1 className="text-base font-semibold leading-6 text-foreground">
          {copy.myAcceptancesTitle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.myAcceptancesSubtitle}</p>
      </div>

      {loadFailed ? (
        <AccountListState icon={ShieldAlert} tone="destructive" message={copy.myAcceptancesLoadError} />
      ) : acceptances.length === 0 ? (
        <AccountListState icon={FileText} message={copy.myAcceptancesEmpty} />
      ) : (
        <AccountPanel className="divide-y divide-border">
          {acceptances.map((acceptance, index) => (
            <AcceptanceRow
              key={`${acceptance.agreementType}-${acceptance.documentVersionId ?? acceptance.version}-${index}`}
              acceptance={acceptance}
              locale={locale}
            />
          ))}
        </AccountPanel>
      )}
    </div>
  );
}

function AcceptanceRow({
  acceptance,
  locale,
}: {
  acceptance: AcceptanceRecord;
  locale: Locale;
}) {
  const copy = LEGAL_COPY[locale];
  const documentBacked = isDocumentBacked(acceptance.agreementType);
  const versionNo = Number(acceptance.version);
  const canRead = documentBacked && acceptance.documentVersionId !== null && Number.isInteger(versionNo);
  const languageLabel =
    acceptance.acceptedLocale === 'vi'
      ? copy.languageVi
      : acceptance.acceptedLocale === 'en'
        ? copy.languageEn
        : copy.languageUnknown;

  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-foreground">
          {agreementTypeLabel(acceptance.agreementType, locale)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {Number.isNaN(versionNo) ? acceptance.version : copy.versionLabel(versionNo)}
          {' · '}
          {formatDate(acceptance.acceptedAt, locale)}
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
          {copy.viewText}
        </Link>
      ) : null}
    </div>
  );
}
