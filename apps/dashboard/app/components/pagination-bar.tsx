import { PAGE_SIZE_OPTIONS } from '@booking/contracts';
import {
  Pagination,
  type PaginationLabels,
} from '@booking/ui/components/data-table/pagination';

/**
 * Vietnamese-labelled wrapper over the shared `<Pagination>` (numbered pages +
 * ellipsis + rows-per-page + count). Every server-paginated dashboard list renders
 * this in its footer; build `hrefFor` from `readListParams(...).pageHref`
 * (`~/lib/pagination`) so filters + page size are preserved.
 */
const VI_LABELS: PaginationLabels = {
  previous: 'Trước',
  next: 'Sau',
  rowsPerPage: 'Số dòng',
  showing: (from, to, total) => `${from}–${to} / ${total}`,
};

export function PaginationBar({
  page,
  pageSize,
  total,
  hrefFor,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (target: { page: number; pageSize: number }) => string;
  pageSizeOptions?: readonly number[];
  className?: string;
}) {
  return (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      hrefFor={hrefFor}
      pageSizeOptions={pageSizeOptions}
      labels={VI_LABELS}
      className={className}
    />
  );
}
