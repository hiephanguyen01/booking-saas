import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@booking/ui/components/ui/pagination';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useHref, useLinkClickHandler, type To } from 'react-router';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { useCatalogPaginationController } from '~/features/catalog/hooks/use-catalog-pagination-controller';

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
  const { t } = useTranslation(NsI18n.Catalog);
  const { items, nextHref, previousHref } = useCatalogPaginationController({
    currentPage,
    totalPages,
  });

  return (
    <Pagination className="mt-8" aria-label={t('pagination.ariaLabel')}>
      <PaginationContent>
        {previousHref ? (
          <PaginationItem>
            <PaginationRouterLink
              to={previousHref}
              size="default"
              className="gap-1 px-2.5 sm:pl-2.5"
              aria-label={t('pagination.previous')}
            >
              <ChevronLeft aria-hidden="true" />
              <span className="hidden sm:block">{t('pagination.previous')}</span>
            </PaginationRouterLink>
          </PaginationItem>
        ) : null}

        {items.map((item) =>
          item.kind === 'ellipsis' ? (
            <PaginationItem key={item.key}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item.page}>
              <PaginationRouterLink
                to={item.href}
                isActive={item.active}
                aria-label={t('pagination.goToPage', { page: item.page })}
              >
                {item.page}
              </PaginationRouterLink>
            </PaginationItem>
          ),
        )}

        {nextHref ? (
          <PaginationItem>
            <PaginationRouterLink
              to={nextHref}
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
