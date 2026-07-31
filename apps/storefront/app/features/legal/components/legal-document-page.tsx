import type { LegalDocumentResponse } from '@booking/contracts';
import { formatDate, NsI18n, useTranslation } from '@booking/i18n';
import { Link } from 'react-router';
import { RestrictedMarkdown } from '@booking/ui/components/markdown/restricted-markdown';
import { storefrontPaths } from '~/constants/paths';
import { LEGAL_FALLBACK_NOTICE_VI } from '~/features/legal/lib/legal-copy';
import { useLocale } from '~/hooks/use-locale';

/**
 * The public rendering of one tenant legal document (current or a specific
 * historical version). Stays reachable — and readable — even when the rest of
 * the storefront is dark (see the `bypassTenantGate` exemption in
 * `request-security.server.ts` and `storefront-app-shell.tsx`), so this page
 * intentionally does not depend on anything that requires a live tenant.
 */
export function LegalDocumentPage({
  document,
  isHistorical,
}: {
  document: LegalDocumentResponse;
  isHistorical: boolean;
}) {
  const locale = useLocale();
  const { t } = useTranslation(NsI18n.Legal);

  return (
    <main className="mx-auto w-full max-w-187.5 px-4 py-10 sm:px-6 lg:px-0">
      <article className="text-foreground">
        <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('versionLabel', { versionNo: document.versionNo })} · {t('effectiveFrom')}{' '}
          {formatDate(document.publishedAt, locale)}
        </p>

        {isHistorical ? (
          <div className="mt-4 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
            {t('historicalNotice')}{' '}
            <Link
              to={storefrontPaths.legal(locale, document.docType)}
              className="font-medium text-primary underline underline-offset-2"
            >
              {t('viewCurrent')}
            </Link>
          </div>
        ) : null}

        {document.fellBack ? (
          <div
            role="status"
            className="mt-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground"
          >
            {LEGAL_FALLBACK_NOTICE_VI}
          </div>
        ) : null}

        <RestrictedMarkdown source={document.bodyMd} className="mt-8" />
      </article>
    </main>
  );
}
