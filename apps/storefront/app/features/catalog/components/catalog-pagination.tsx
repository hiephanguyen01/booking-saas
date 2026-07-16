import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@booking/ui/components/ui/pagination';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useHref, useLinkClickHandler, useSearchParams, type To } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';

/** Pages either side of the current one kept expanded. */
const SIBLINGS = 1;

/**
 * `1 … 4 5 6 … 20` — a bounded window.
 *
 * The catalog used to render one button per page, which is fine at three pages
 * and unusable at forty.
 */
function paginationRange(current: number, total: number): (number | 'ellipsis')[] {
  const start = Math.max(2, current - SIBLINGS);
  const end = Math.min(total - 1, current + SIBLINGS);
  const items: (number | 'ellipsis')[] = [1];
  if (start > 2) items.push('ellipsis');
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push('ellipsis');
  items.push(total);
  return items;
}

/**
 * `PaginationLink` renders a bare `<a>`, so routing it through the router keeps
 * pagination a client navigation instead of a full document load.
 */
function PaginationRouterLink({
  to,
  ...props
}: { to: To } & Omit<ComponentProps<typeof PaginationLink>, 'href'>) {
  const href = useHref(to);
  const handleClick = useLinkClickHandler(to);
  return <PaginationLink href={href} onClick={handleClick} {...props} />;
}

export function CatalogPagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation(NsI18n.Catalog);

  function pageHref(page: number): string {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    return `?${next.toString()}`;
  }

  return (
    <Pagination className="mt-8" aria-label={t('pagination.ariaLabel')}>
      <PaginationContent>
        {currentPage > 1 ? (
          <PaginationItem>
            <PaginationRouterLink
              to={pageHref(currentPage - 1)}
              size="default"
              className="gap-1 px-2.5 sm:pl-2.5"
              aria-label={t('pagination.previous')}
            >
              <ChevronLeft aria-hidden="true" />
              <span className="hidden sm:block">{t('pagination.previous')}</span>
            </PaginationRouterLink>
          </PaginationItem>
        ) : null}

        {paginationRange(currentPage, totalPages).map((page, index) =>
          page === 'ellipsis' ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={page}>
              <PaginationRouterLink
                to={pageHref(page)}
                isActive={page === currentPage}
                aria-label={t('pagination.goToPage', { page })}
              >
                {page}
              </PaginationRouterLink>
            </PaginationItem>
          ),
        )}

        {currentPage < totalPages ? (
          <PaginationItem>
            <PaginationRouterLink
              to={pageHref(currentPage + 1)}
              size="default"
              className="gap-1 px-2.5 sm:pr-2.5"
              aria-label={t('pagination.next')}
            >
              <span className="hidden sm:block">{t('pagination.next')}</span>
              <ChevronRight aria-hidden="true" />
            </PaginationRouterLink>
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}
