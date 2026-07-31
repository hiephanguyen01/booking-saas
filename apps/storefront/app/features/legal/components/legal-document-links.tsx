import type { LegalDocumentType } from '@booking/contracts';
import { NsI18n, useTranslation, type Locale } from '@booking/i18n';
import { Fragment } from 'react';
import { Link } from 'react-router';
import { cn } from '@booking/ui/lib/utils';
import { storefrontPaths } from '~/constants/paths';

/**
 * A comma-and-joined inline list of links to each of `documents`' public legal
 * pages ("Điều khoản đối tác, Điều khoản sử dụng và Chính sách bảo mật"). Used
 * beside every consent checkbox/notice so a document named in copy is also one
 * click away, and by the storefront footer.
 */
export function LegalDocumentLinks({
  documents,
  locale,
  className,
  linkClassName,
}: {
  documents: ReadonlyArray<{ docType: LegalDocumentType }>;
  locale: Locale;
  className?: string;
  linkClassName?: string;
}) {
  const { t } = useTranslation(NsI18n.Legal);
  if (documents.length === 0) return null;

  return (
    <span className={cn('text-sm', className)}>
      {documents.map((document, index) => (
        <Fragment key={document.docType}>
          {index > 0 ? (index === documents.length - 1 ? t('linksJoiner') : ', ') : null}
          <Link
            to={storefrontPaths.legal(locale, document.docType)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('font-medium text-primary underline underline-offset-2', linkClassName)}
          >
            {t(`documentLabels.${document.docType}`)}
          </Link>
        </Fragment>
      ))}
    </span>
  );
}
