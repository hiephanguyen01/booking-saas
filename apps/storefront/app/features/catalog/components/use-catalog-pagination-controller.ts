import { useSearchParams } from 'react-router';

/** Pages either side of the current one kept expanded. */
const SIBLINGS = 1;

export type CatalogPaginationItem =
  | {
      kind: 'page';
      page: number;
      href: string;
      active: boolean;
    }
  | {
      kind: 'ellipsis';
      key: string;
    };

export function useCatalogPaginationController({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  const [searchParams] = useSearchParams();
  const pageHref = (page: number): string => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    return `?${next.toString()}`;
  };
  const items = paginationRange(currentPage, totalPages).map(
    (page, index): CatalogPaginationItem =>
      page === 'ellipsis'
        ? { kind: 'ellipsis', key: `ellipsis-${index}` }
        : { kind: 'page', page, href: pageHref(page), active: page === currentPage },
  );

  return {
    items,
    nextHref: currentPage < totalPages ? pageHref(currentPage + 1) : null,
    previousHref: currentPage > 1 ? pageHref(currentPage - 1) : null,
  };
}

/** `1 … 4 5 6 … 20` — a bounded page window. */
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
